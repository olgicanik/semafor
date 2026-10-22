# tests/test_store.py
import pytest
from app.config import DEFAULT_SIM_SERVERS
from app.health_rules import Color
from app.models import TaskStatus
from app.store import (build_snapshot, init_db, job_details, latest_jobs, open_db,
                       update_recommendation, upsert_server, upsert_task)
from app.sources.simulator import SimulatorSource


def _task(job_id, server="QA1", cat="QA", status="Ready to run", err=""):
    return TaskStatus(job_id=job_id, project_name="P", branch_name="main",
                      job_name=f"j{job_id}", job_label="L", job_version="1.0",
                      context="QA", target_server=server, server_category=cat,
                      execution_status=status, error_message=err)


def _servers():
    out = []
    for item in DEFAULT_SIM_SERVERS.split(","):
        name, cat, ip = [p.strip() for p in item.split(":")]
        out.append({"name": name, "category": cat, "ip": ip})
    return out


async def test_upsert_idempotence(db):
    await init_db(db)
    await upsert_task(db, _task(1))
    await upsert_task(db, _task(1))
    await db.commit()
    cur = await db.execute("SELECT COUNT(*) FROM Jobs")
    assert (await cur.fetchone())[0] == 1
    cur = await db.execute("SELECT COUNT(*) FROM JobExecutions")
    assert (await cur.fetchone())[0] == 2


async def test_server_ip_join(db):
    await init_db(db)
    await upsert_server(db, {"name": "QA1", "ip": "10.12.3.4", "category": "QA"})
    await upsert_task(db, _task(7, server="QA1"))
    await db.commit()
    rows = await latest_jobs(db)
    assert rows[0]["server_ip"] == "10.12.3.4"


async def test_update_recommendation_writes_latest_execution(db):
    await init_db(db)
    await upsert_task(db, _task(1))
    await upsert_task(db, _task(1))          # two executions
    await update_recommendation(db, 1, '{"error_summary": "s", "action_item": "a"}')
    await db.commit()
    cur = await db.execute("SELECT ai_recommendation FROM JobExecutions ORDER BY execution_id")
    rows = await cur.fetchall()
    assert rows[0][0] == ""                 # blank carry (the plan's upsert stores "")
    assert rows[1][0] == '{"error_summary": "s", "action_item": "a"}'


async def test_job_details_unknown_id(db):
    await init_db(db)
    assert await job_details(db, 999999) is None


async def test_build_snapshot_counts_match_simulator_distribution():
    servers = _servers()
    src = SimulatorSource(servers)
    fetched = await src.fetch()
    rows = []
    for name, tasks in fetched.items():
        for t in tasks:
            rows.append({"job_id": t.job_id, "job_name": t.job_name,
                         "project_name": t.project_name, "branch_name": t.branch_name,
                         "job_label": t.job_label, "job_version": t.job_version,
                         "context": t.context, "target_server": t.target_server,
                         "server_category": t.server_category,
                         "server_ip": next(s["ip"] for s in servers if s["name"] == name),
                         "execution_status": t.execution_status,
                         "error_message": t.error_message, "log_snippet": "",
                         "ai_recommendation": "",
                         "last_run_time": t.last_run_time.isoformat() if t.last_run_time else "",
                         "next_run_time": None, "trigger_status": ""})
    snap = build_snapshot(rows, "now", servers=servers)
    total = sum(m["total_count"] for m in (s["metrics"] for s in snap["data"]))
    assert total == 5000
    prod = [s for s in snap["data"] if s["category"] == "PROD"]
    assert all(s["metrics"]["red_count"] == 0 for s in prod)
    for s in snap["data"]:
        m = s["metrics"]
        assert m["green_count"] + m["orange_count"] + m["red_count"] + m["unknown_count"] == m["total_count"]


async def test_build_snapshot_unreachable_server_unknown():
    servers = _servers()
    rows = []
    # only one server has rows; all five are seeded -> the other four are UNKNOWN
    for i in range(3):
        rows.append(_row(i, "Business_Lake_Dev_SL4"))
    snap = build_snapshot(rows, "now", servers=servers)
    missing = [s for s in snap["data"] if s["server_name"] != "Business_Lake_Dev_SL4"]
    assert all(s["status_color"] == "UNKNOWN" for s in missing)
    assert all(s["metrics"]["unreachable"] is True for s in missing)


def _row(i, server, cat="QA", status="Ready to run", err=""):
    return {"job_id": i, "job_name": f"j{i}", "project_name": "P", "branch_name": "main",
            "job_label": "L", "job_version": "1.0", "context": "QA",
            "target_server": server, "server_category": cat, "server_ip": "0.0.0.0",
            "execution_status": status, "error_message": err, "log_snippet": "",
            "ai_recommendation": "", "last_run_time": "", "next_run_time": None,
            "trigger_status": ""}


async def test_build_snapshot_empty_servers_drops_stale_rows():
    servers = [{"name": "QA_NODE", "category": "QA", "ip": "10.0.0.1"}]
    rows = [_row(1, "QA_NODE", status="Ready to run")]
    snap = build_snapshot(rows, "now", servers=servers, empty_servers={"QA_NODE"})
    entry = snap["data"][0]
    assert entry["status_color"] == "UNKNOWN"
    assert entry["metrics"]["total_count"] == 0 and entry["metrics"]["unreachable"] is True
    assert snap["jobs_by_server"].get("QA_NODE", []) == []
    assert snap["jobs_by_id"] == {}


def test_build_snapshot_failed_first_ordering():
    servers = [{"name": "QA_NODE", "category": "QA", "ip": "10.0.0.1"}]
    rows = [
        _row(3, "QA_NODE", status="Ready to run"),
        _row(1, "QA_NODE", status="Job ended with error(s)", err="ora dead"),
        _row(2, "QA_NODE", status="Job ended with error(s)", err="killed by user"),
        _row(4, "QA_NODE", status="Running", err="boom"),
    ]
    snap = build_snapshot(rows, "now", servers=servers)
    colors = [j["status_color"] for j in snap["jobs_by_server"]["QA_NODE"]]
    order = {"RED": 0, "ORANGE": 1, "GREEN": 2, "UNKNOWN": 3}
    assert colors == sorted(colors, key=lambda c: order[c])
    assert colors[0] == "RED"
