# app/sources/tac_live.py
import asyncio, base64, json, logging
from datetime import datetime, timezone
import httpx
from .base import Source
from ..models import TaskStatus

log = logging.getLogger(__name__)

class TacLiveSource(Source):
    def __init__(self, servers: list[dict], username: str, verify_ssl: bool = False,
                 timeout: float = 10.0, max_concurrency: int = 5):
        self.servers = servers   # [{"url","password","name","category","ip"}, ...]
        self.username = username
        self.verify_ssl = verify_ssl
        self.timeout = timeout
        self._sema = asyncio.Semaphore(max_concurrency)

    @staticmethod
    def _encode(url: str, username: str, password: str) -> str:
        payload = base64.b64encode(
            json.dumps({"actionName": "listTasks", "authUser": username, "authPass": password},
                       separators=(",", ":")).encode("utf-8")).decode("ascii")
        return f"{url}?{payload}"

    async def fetch(self) -> dict:
        """Return {server_name: [TaskStatus, ...]}. Empty list == unreachable server."""
        async with httpx.AsyncClient(verify=self.verify_ssl, timeout=self.timeout) as client:
            jobs = [self._fetch_one(client, srv) for srv in self.servers]  # gather keeps order
            out = {name: tasks for name, tasks in await asyncio.gather(*jobs)}
            return out

    async def _fetch_one(self, client: httpx.AsyncClient, srv: dict) -> tuple[str, list]:
        url = self._encode(url=srv["url"], username=self.username, password=srv["password"])
        try:
            r = await client.get(url)
            r.raise_for_status()
            ctype = r.headers.get("content-type", "")
            if "application/json" not in ctype:
                log.warning("SSO/HTML redirect trap on %s (content-type=%s)", srv["name"], ctype)
                return srv["name"], []
            return srv["name"], list_of_tasks_from_json(r.json(), srv)
        except Exception as e:   # noqa: BLE001 - network/auth failures are non-fatal here
            log.error("TAC fetch failed for %s: %s", srv["name"], e)
            return srv["name"], []


def _norm(rec: dict, *aliases: str) -> str:
    """Case/space-insensitive lookup on a TAC record; '' when absent/blank."""
    for a in aliases:
        v = rec.get(a)
        if v not in (None, ""):
            return str(v)
    return ""

def _parse_ts(value: str) -> "datetime | None":
    v = value.strip()
    if not v:
        return None
    if v.isdigit():                                   # epoch seconds/millis
        n = int(v)
        return datetime.fromtimestamp(n / 1000.0 if n > 10_000_000_000 else n, tz=timezone.utc)
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        return None                                   # unparseable -> None (UI shows '—')

def list_of_tasks_from_json(payload, srv: dict) -> list:
    """Normalize a TAC metaServlet `listTasks` payload onto TaskStatus.

    Accepts either a bare list or a JSON object holding the list under a common
    key ('tasks', 'runningTasks', 'items', 'list', 'data'). TAC column headers
    arrive as mixed-case keys containing spaces ('Error Status', 'Last Run');
    `_norm()` collapses that variation via aliases. A missing/blank Error Status
    is normalised to '' so the rule engine takes the GREEN path; a TAC numeric
    error code (0/1) is mapped to '' / 'Job ended with error(s)'. Records with
    no recognizable numeric job id (metadata/pagination rows) are skipped.
    """
    if isinstance(payload, dict):
        for key in ("tasks", "runningTasks", "items", "list", "data"):
            if isinstance(payload.get(key), list):
                payload = payload[key]
                break
    if not isinstance(payload, list):
        return []
    out = []
    for rec in payload:
        if not isinstance(rec, dict):
            continue
        try:
            job_id = int(_norm(rec, "id", "taskid", "jobid"))
        except (TypeError, ValueError):
            continue
        status = _norm(rec, "state", "status", "executionstatus") or "Ready to run"
        err = _norm(rec, "errorstatus", "error", "errormessage")
        if err.isdigit():                             # 0 -> clean, 1 -> failed
            err = "" if int(err) == 0 else "Job ended with error(s)"
        out.append(TaskStatus(
            job_id=job_id,
            project_name=_norm(rec, "project", "projectname") or "unknown_project",
            branch_name=_norm(rec, "branch", "branchname") or "main",
            job_name=_norm(rec, "name", "jobname") or f"job_{job_id}",
            job_label=_norm(rec, "label"),
            job_version=_norm(rec, "version", "jobversion") or "1.0",
            context=_norm(rec, "context", "jobcontext") or "PROD",
            target_server=srv["name"],
            server_category=srv["category"],
            execution_status=status,
            error_message=err,
            last_run_time=_parse_ts(_norm(rec, "lastrun", "lastruntime", "endtime", "starttime")),
            next_run_time=_parse_ts(_norm(rec, "nextrun", "nextruntime")),
            trigger_status=_norm(rec, "triggerstatus", "trigger"),
        ))
    return out
