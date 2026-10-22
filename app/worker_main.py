# app/worker_main.py (core loop — condensed)
import argparse, asyncio, datetime as dt, json, logging
from .cache import StaticCache
from .config import Settings, build_settings
from .diagnostics import pick
from .health_rules import Color, HealthRules
from .models import TaskStatus
from .store import (build_snapshot, init_db, latest_jobs, open_db,
                    update_recommendation, upsert_server, upsert_task)

log = logging.getLogger(__name__)
cache = StaticCache()          # module-level: run_once publishes, CLI drives the loop

def _from_row(r: dict) -> TaskStatus:
    """DB row (see _JOB_SELECT) -> TaskStatus for the diagnostics engine."""
    return TaskStatus(
        job_id=r["job_id"], project_name=r["project_name"], branch_name=r["branch_name"],
        job_name=r["job_name"], job_label=r["job_label"], job_version=r["job_version"],
        context=r["context"], target_server=r["target_server"],
        server_category=r["server_category"], execution_status=r["execution_status"],
        error_message=r["error_message"], last_run_time=r["last_run_time"],
        log_snippet=r["log_snippet"] or r["error_message"])

# Cap concurrent diagnosis calls so a slow/dead Gemini endpoint (each call has a
# timeout, default 15 s) can never serialize the whole pass far past --interval.
_DIAG_CONCURRENCY = 4

async def run_once(cfg: Settings) -> dict:
    # open_db returns a Connection (an async factory, NOT an async context
    # manager) -> `async with open_db(...)` raised TypeError on the first pass;
    # v6 opens explicitly and closes in finally (verified: --once --sim exit 0).
    db = await open_db(cfg.db_path)
    try:
        await init_db(db)
        for srv in cfg.servers:
            await upsert_server(db, srv)
        # Snapshot latest verdicts BEFORE upserting. Every pass inserts a fresh
        # JobExecutions row with a blank ai_recommendation, so the 'already
        # cached (token ROI)' gate below could never skip unless the previous
        # verdict is carried forward for an unchanged failure (spec §6.2: a
        # broken job must not trigger repeated LLM calls pass after pass).
        prior = {r["job_id"]: (r["error_message"], r["ai_recommendation"])
                 for r in await latest_jobs(db)}
        fetched = await cfg.make_source().fetch()
        # Servers that returned ZERO tasks this pass are unreachable (SSO trap /
        # node down). They must render UNKNOWN in this snapshot even when stale
        # rows from an earlier pass exist in the DB (v7: build_snapshot drops
        # those rows so a dead node can never show yesterday's GREEN as current).
        empty_servers = {s["name"] for s in cfg.servers} - {n for n, ts in fetched.items() if ts}
        for _name, tasks in fetched.items():
            for t in tasks:
                await upsert_task(db, t)
        engine = pick({"GEMINI_API_KEY": cfg.gemini_key, "GEMINI_ENDPOINT": cfg.gemini_endpoint})
        sema = asyncio.Semaphore(_DIAG_CONCURRENCY)

        async def _diagnose(r: dict) -> dict:
            async with sema:
                return await engine.diagnose(_from_row(r))

        for r in await latest_jobs(db):
            # NOTE: Color is module-level; HealthRules.Color does not exist (v3 bug).
            if HealthRules.job_color(r["execution_status"], r["error_message"]) is not Color.RED \
               or (r["ai_recommendation"] or "").strip():
                continue                               # non-RED or already cached (token ROI)
            prev_err, prev_ai = prior.get(r["job_id"], ("", ""))
            if (prev_ai or "").strip() and (prev_err or "").strip() and \
               (r["error_message"] or "").strip() == prev_err.strip():
                # Same failure as last pass -> reuse the cached verdict, do NOT
                # spend tokens on a fresh LLM call (spec §6.2 caching efficiency).
                await update_recommendation(db, r["job_id"], prev_ai)
                continue
            try:
                verdict = await _diagnose(r)
            except Exception as e:                     # noqa: BLE001 - AI outage must not kill the pass
                log.warning("diagnostics failed for job %s: %s", r["job_id"], e)
                continue
            await update_recommendation(db, r["job_id"], json.dumps(verdict))
        snap = build_snapshot(await latest_jobs(db),
                              dt.datetime.now(dt.timezone.utc).isoformat(),
                              cfg.servers, empty_servers=empty_servers)
        await db.commit()
    finally:
        await db.close()
    cache.publish(snap)                                # -> status.json (atomic)
    log.info("published %d servers, %d jobs",
             len(snap["data"]), sum(m["total_count"] for m in (s["metrics"] for s in snap["data"])))
    return snap

async def _loop(cfg: Settings, interval: int) -> None:
    while True:
        await run_once(cfg)
        await asyncio.sleep(interval)

def main() -> None:
    ap = argparse.ArgumentParser(prog="app.worker_main")
    ap.add_argument("--once", action="store_true", help="run one pass and exit")
    ap.add_argument("--interval", type=int, default=30, help="seconds between passes")
    ap.add_argument("--source", choices=["auto", "sim", "live"], default=None,
                    help="override INGESTION_SOURCE for this run")
    ap.add_argument("--sim", action="store_true", help="shorthand for --source sim")
    args = ap.parse_args()
    cfg = build_settings()
    if args.source:
        cfg.source_mode = args.source
    if args.sim:
        cfg.source_mode = "sim"
    if args.once:
        asyncio.run(run_once(cfg))
    else:
        asyncio.run(_loop(cfg, args.interval))

if __name__ == "__main__":
    main()
