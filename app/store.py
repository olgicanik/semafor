# app/store.py (aiosqlite; tables per §5)
import aiosqlite, json, logging, sqlite3
from .health_rules import HealthRules
from .models import TaskStatus
log = logging.getLogger(__name__)

# Verbatim §5 DDL (Jobs, Servers, JobExecutions, indexes) — the executable copy.
# init_db also creates the latest-execution-per-job view the aggregations need.
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS Jobs (
  job_id         INTEGER PRIMARY KEY,
  project_name   TEXT    NOT NULL,
  branch_name    TEXT    NOT NULL,
  job_name       TEXT    NOT NULL,
  job_label      TEXT,
  job_version    TEXT    NOT NULL,
  context        TEXT    NOT NULL,
  target_server  TEXT    NOT NULL,
  server_category TEXT   NOT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS Servers (
  server_name     TEXT PRIMARY KEY,
  server_ip       TEXT NOT NULL,
  server_category TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS JobExecutions (
  execution_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id           INTEGER NOT NULL,
  last_run_time    TEXT,
  next_run_time    TEXT,
  execution_status TEXT    NOT NULL,
  error_message    TEXT,
  trigger_status   TEXT,
  log_snippet      TEXT,
  ai_recommendation TEXT,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES Jobs(job_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_jobs_server_category ON Jobs(target_server, server_category);
CREATE INDEX IF NOT EXISTS idx_executions_job_lookup ON JobExecutions(job_id, execution_id DESC);
CREATE INDEX IF NOT EXISTS idx_executions_status ON JobExecutions(execution_status);
"""

VIEW_DDL = """
CREATE VIEW IF NOT EXISTS v_latest_exec AS
SELECT e.* FROM JobExecutions e
JOIN (SELECT job_id, MAX(execution_id) AS max_id FROM JobExecutions GROUP BY job_id) m
  ON e.execution_id = m.max_id;
"""

async def open_db(path: str) -> aiosqlite.Connection:
    """Single connection factory for worker + tests.

    Sets the row factory to sqlite3.Row by ATTRIBUTE ASSIGNMENT (the
    row_factory= keyword was removed from sqlite3.connect on CPython 3.15) —
    the plan's dict(row) reads require name-keyed rows (verified: aiosqlite's
    default factory is None -> tuples -> dict(row) raises TypeError).
    """
    db = await aiosqlite.connect(path)
    db.row_factory = sqlite3.Row
    await db.execute("PRAGMA foreign_keys=ON")
    return db

async def init_db(conn: aiosqlite.Connection) -> None:
    await conn.executescript(SCHEMA_SQL)
    await conn.executescript(VIEW_DDL)
    await conn.commit()

async def upsert_server(conn, srv: dict) -> None:
    """Register server metadata — incl. server_ip, which /servers/status returns."""
    await conn.execute("""
        INSERT INTO Servers (server_name, server_ip, server_category) VALUES (?,?,?)
        ON CONFLICT(server_name) DO UPDATE SET
            server_ip=excluded.server_ip, server_category=excluded.server_category
    """, (srv["name"], srv["ip"], srv["category"]))

async def upsert_task(conn, t: TaskStatus) -> None:
    await conn.execute("""
        INSERT INTO Jobs (job_id, project_name, branch_name, job_name, job_label,
                          job_version, context, target_server, server_category)
        VALUES (?,?,?,?,?,?,?,?,?)
        ON CONFLICT(job_id) DO UPDATE SET
            project_name=excluded.project_name, branch_name=excluded.branch_name,
            job_name=excluded.job_name, job_label=excluded.job_label,
            job_version=excluded.job_version, context=excluded.context,
            target_server=excluded.target_server, server_category=excluded.server_category
    """, (t.job_id, t.project_name, t.branch_name, t.job_name, t.job_label,
          t.job_version, t.context, t.target_server, t.server_category))
    await conn.execute("""
        INSERT INTO JobExecutions (job_id, last_run_time, next_run_time, execution_status,
                                   error_message, trigger_status, log_snippet, ai_recommendation, updated_at)
        VALUES (?,?,?,?,?,?,?,?, CURRENT_TIMESTAMP)
    """, (t.job_id, t.last_run_time.isoformat() if t.last_run_time else None,
          t.next_run_time.isoformat() if t.next_run_time else None,
          t.execution_status, t.error_message, t.trigger_status, t.log_snippet, t.ai_recommendation))

_JOB_SELECT = """
SELECT j.job_id, j.project_name, j.branch_name, j.job_name, j.job_label,
       j.job_version, j.context, j.target_server, j.server_category, s.server_ip,
       e.execution_id, e.last_run_time, e.next_run_time, e.execution_status,
       e.error_message, e.trigger_status, e.log_snippet, e.ai_recommendation
FROM Jobs j
JOIN v_latest_exec e ON e.job_id = j.job_id
LEFT JOIN Servers s ON s.server_name = j.target_server
"""

async def latest_jobs(conn) -> list:
    """One dict per job: its latest execution joined to job + server metadata."""
    cur = await conn.execute(_JOB_SELECT)
    return [dict(r) for r in await cur.fetchall()]    # sqlite3.Row -> dict by name

async def job_details(conn, job_id: int) -> "dict | None":
    cur = await conn.execute(_JOB_SELECT + " WHERE j.job_id = ?", (job_id,))
    row = await cur.fetchone()
    return dict(row) if row else None

async def update_recommendation(conn, job_id: int, text: str) -> None:
    """Write an AI verdict onto the job's latest execution row (token-ROI cache)."""
    await conn.execute("""
        UPDATE JobExecutions SET ai_recommendation = ?
        WHERE job_id = ? AND execution_id = (
            SELECT MAX(execution_id) FROM JobExecutions WHERE job_id = ?)
    """, (text, job_id, job_id))

def build_snapshot(rows: list, generated_at: str, servers: "list[dict] | None" = None,
                   empty_servers: "set | None" = None) -> dict:
    """Rows -> cache payload. Color comes from the single rule-engine classifier
    (HealthRules.job_color), never from re-derived SQL; jobs are ordered failed-first.
    servers= pre-seeds a metrics block per configured node so a server that
    returned ZERO jobs (SSO trap / down) still renders as UNKNOWN instead of
    vanishing from /servers/status (spec §5.2 + Step 2 promise). empty_servers=
    names of configured servers whose fetch came back empty THIS pass: those
    servers are shown as UNKNOWN and their (possibly stale) rows are dropped, so
    a node that went down after earlier successful passes can never keep showing
    yesterday's GREEN/status as current. Returns the /servers/status payload plus
    the two lookup indexes the API reads.
    """
    order = {"RED": 0, "ORANGE": 1, "GREEN": 2, "UNKNOWN": 3}
    empty_servers = empty_servers or set()
    if empty_servers:                             # drop stale rows of unreachable nodes
        rows = [r for r in rows if r["target_server"] not in empty_servers]
    per: dict = {}
    jobs_by_server: dict = {}
    jobs_by_id: dict = {}
    if servers:
        for srv in servers:                       # seed known nodes first
            name = srv["name"]
            per[name] = {"server_ip": srv.get("ip") or "0.0.0.0",
                         "category": srv.get("category") or "PROD",
                         "green": 0, "orange": 0, "red": 0, "unknown": 0, "total": 0}
    for r in rows:
        name = r["target_server"]
        m = per.setdefault(name, {
            "server_ip": r.get("server_ip") or "0.0.0.0",
            "category": r["server_category"],
            "green": 0, "orange": 0, "red": 0, "unknown": 0, "total": 0})
        color = HealthRules.job_color(r["execution_status"], r["error_message"])
        m[color.value.lower()] += 1
        m["total"] += 1
        job = {
            "job_id": r["job_id"], "name": r["job_name"], "project": r["project_name"],
            "branch": r["branch_name"], "label": r["job_label"], "version": r["job_version"],
            "context": r["context"], "last_run": str(r["last_run_time"] or ""),
            "status": r["execution_status"], "status_color": color.value, "server": name,
        }
        jobs_by_id.setdefault(str(r["job_id"]), {**job,
            "execution_status": r["execution_status"], "error_message": r["error_message"],
            "log_snippet": r["log_snippet"] or "", "ai_analysis": _parse_ai(r["ai_recommendation"])})
        jobs_by_server.setdefault(name, []).append(job)
    data = []
    for name, m in per.items():
        m["unreachable"] = m["total"] == 0            # set before server_color reads it
        c = HealthRules.server_color(m)
        data.append({
            "server_id": 1 + sum(ord(ch) for ch in name) % 100000,   # stable demo id
            "server_ip": m["server_ip"], "server_name": name, "category": m["category"],
            "status_color": c.value,
            "metrics": {"green_count": m["green"], "orange_count": m["orange"],
                        "red_count": m["red"], "unknown_count": m["unknown"],
                        "total_count": m["total"], "unreachable": m["unreachable"]}})
    for lst in jobs_by_server.values():
        lst.sort(key=lambda j: (order[j["status_color"]], j["job_id"]))
    data.sort(key=lambda s: s["server_name"])
    return {"status": "success", "generated_at": generated_at, "data": data,
            "jobs_by_server": jobs_by_server, "jobs_by_id": jobs_by_id}

def _parse_ai(text) -> dict:
    try:
        return json.loads(text or "{}")
    except ValueError:
        return {}
