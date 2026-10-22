# tests/test_worker.py — v9: the two v7 worker behaviours pinned as concrete tests
import pytest
import app.worker_main as wm
from app.config import DEFAULT_SIM_SERVERS, Settings
from app.models import TaskStatus
from app.sources.base import Source
from app.diagnostics import DiagnosticsEngine

def _sim_settings(tmp_path):
    servers = []
    for item in DEFAULT_SIM_SERVERS.split(","):
        name, cat, ip = [p.strip() for p in item.split(":")]
        servers.append({"name": name, "category": cat, "ip": ip})
    return Settings(servers=servers, source_mode="sim", verify_ssl=False,
                    api_host="", api_port=0, db_path=str(tmp_path / "t.db"),
                    tac_username="", gemini_key="", gemini_endpoint="")

class CountingEngine(DiagnosticsEngine):
    """Diagnosis spy for the token-ROI test."""
    def __init__(self):
        self.calls = 0
    async def diagnose(self, job: TaskStatus) -> dict:
        self.calls += 1
        return {"error_summary": f"sim {job.job_id}", "action_item": "ignore"}

class FlakySource(Source):
    """All servers healthy until `down_on_pass`, after which `down_name` returns []."""
    def __init__(self, servers, down_name, down_on_pass):
        self.servers, self.down_name, self.down_on_pass = servers, down_name, down_on_pass
        self.pass_no = 0
    async def fetch(self) -> dict:
        self.pass_no += 1
        out = {}
        for i, srv in enumerate(self.servers):
            if srv["name"] == self.down_name and self.pass_no >= self.down_on_pass:
                out[srv["name"]] = []
                continue
            out[srv["name"]] = [TaskStatus(
                job_id=100 + i * 100 + j, project_name="P", branch_name="main",
                job_name=f"j_{i}_{j}", job_label="L", job_version="1.0",
                context="QA", target_server=srv["name"], server_category=srv["category"],
                execution_status="Ready to run", error_message="",
            ) for j in range(3)]
        return out

@pytest.fixture
def no_statusjson(tmp_path, monkeypatch):
    """Keep run_once's status.json publish off the repo tree."""
    monkeypatch.setattr(wm.cache, "path", str(tmp_path / "status.json"))
    monkeypatch.setattr(wm.cache, "_snapshot", None)

async def test_worker_token_roi(monkeypatch, tmp_path, no_statusjson):
    """v7 semantics: pass 1 diagnoses every RED job once; pass 2 (unchanged
    failure set) fires ZERO new calls — spec §6.2 token-ROI carry-forward."""
    engine = CountingEngine()
    monkeypatch.setattr(wm, "pick", lambda cfg: engine)
    snap1 = await wm.run_once(_sim_settings(tmp_path))
    c1 = engine.calls
    reds = sum(s["metrics"]["red_count"] for s in snap1["data"])
    engine.calls = 0
    await wm.run_once(_sim_settings(tmp_path))
    c2 = engine.calls
    assert reds > 0 and c1 == reds          # pass 1: one diagnosis per RED job
    assert c2 == 0                          # pass 2: cached verdicts carried forward

async def test_worker_downed_server(tmp_path, no_statusjson):
    """v7 semantics: a server reachable in pass 1 that returns [] in pass 2 must
    render UNKNOWN / total 0 / unreachable, with its stale rows absent from
    jobs_by_server and jobs_by_id."""
    servers = [{"name": "S1", "category": "QA", "ip": "10.0.0.1"},
               {"name": "S2", "category": "QA", "ip": "10.0.0.2"}]
    cfg = Settings(servers=servers, source_mode="live", verify_ssl=False,
                   api_host="", api_port=0, db_path=str(tmp_path / "t.db"),
                   tac_username="u", gemini_key="", gemini_endpoint="")
    # One SHARED source across both run_once passes: the FlakySource counts
    # passes internally, so a fresh instance per make_source() call would reset
    # pass_no to 1 on every pass and S2 would never go down (verified failure).
    import types
    src = FlakySource(servers, down_name="S2", down_on_pass=2)
    cfg.make_source = types.MethodType(lambda self: src, cfg)
    await wm.run_once(cfg)                              # pass 1: both up
    snap2 = await wm.run_once(cfg)                      # pass 2: S2 down
    s2 = next(s for s in snap2["data"] if s["server_name"] == "S2")
    assert s2["status_color"] == "UNKNOWN"
    assert s2["metrics"]["total_count"] == 0 and s2["metrics"]["unreachable"] is True
    assert not snap2.get("jobs_by_server", {}).get("S2", [])
    assert not any(j.get("server") == "S2" for j in snap2.get("jobs_by_id", {}).values())
