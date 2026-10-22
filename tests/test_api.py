# tests/test_api.py
import pytest
from fastapi.testclient import TestClient
import app.api as api

SNAPSHOT = {
    "status": "success", "generated_at": "2026-10-22T09:00:00Z",
    "data": [{"server_id": 1, "server_ip": "10.12.3.4", "server_name": "QA1",
              "category": "QA", "status_color": "RED",
              "metrics": {"green_count": 985, "orange_count": 12, "red_count": 3,
                          "unknown_count": 0, "total_count": 1000, "unreachable": False}}],
    "jobs_by_server": {"QA1": [
        {"job_id": 7235, "name": "job_bad", "project": "P", "branch": "main", "label": "L",
         "version": "0.6", "context": "DEV", "last_run": "2025-11-07T09:36:02Z",
         "status": "Job ended with error(s)", "status_color": "RED"},
        {"job_id": 7236, "name": "job_ok", "project": "P", "branch": "main", "label": "L",
         "version": "0.6", "context": "DEV", "last_run": "2025-11-07T09:37:02Z",
         "status": "Ready to run", "status_color": "GREEN"}]},
    "jobs_by_id": {"7235": {
        "job_id": 7235, "name": "job_bad", "project": "P", "branch": "main", "label": "L",
        "version": "0.6", "context": "DEV", "last_run": "2025-11-07T09:36:02Z",
        "status": "Job ended with error(s)", "status_color": "RED", "server": "QA1",
        "execution_status": "Job ended with error(s)",
        "error_message": "java.sql.SQLRecoverableException: IO Error",
        "log_snippet": "", "ai_analysis": {"error_summary": "Oracle timeout",
                                           "action_item": "Verify firewall rule."}}},
}

@pytest.fixture
def client(tmp_path):
    # Repoint the singleton cache at a temp file BEFORE lifespan starts, so the
    # watcher (which resolves cache.path per iteration) watches exactly that file.
    api.cache.path = str(tmp_path / "status.json")
    api.cache._snapshot = None
    with TestClient(api.app) as c:
        yield c

def test_servers_status_contract(client):
    api.cache.publish(SNAPSHOT)
    r = client.get("/api/v1/servers/status")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "success"
    assert body["data"][0]["metrics"]["total_count"] == 1000

def test_server_jobs_failed_first(client):
    api.cache.publish(SNAPSHOT)
    body = client.get("/api/v1/servers/QA1/jobs").json()
    assert [j["status_color"] for j in body["jobs"]] == ["RED", "GREEN"]

def test_job_details_and_unknown(client):
    api.cache.publish(SNAPSHOT)
    got = client.get("/api/v1/jobs/7235/details").json()
    assert got["data"]["ai_analysis"]["error_summary"] == "Oracle timeout"
    assert client.get("/api/v1/jobs/999999/details").json()["status"] == "error"

def test_ws_watcher_push(client):
    api.cache.publish(SNAPSHOT)
    with client.websocket_connect("/ws") as ws:
        assert ws.receive_json()["generated_at"] == "2026-10-22T09:00:00Z"   # initial push
        updated = dict(SNAPSHOT, generated_at="2026-10-22T09:01:00Z")
        api.cache.publish(updated)
        got = ws.receive_json()                      # watcher reloads within ~0.5 s (verified)
        assert got["generated_at"] == "2026-10-22T09:01:00Z"

def test_ws_initial_empty_snapshot_has_data(client):
    # v9 regression: cold start with nothing published yet -> the WS initial push
    # must still carry a `data`-bearing shape so App.jsx `snapshot.data.map(...)`
    # never gets a bare {} (confirmed: `cache.snapshot or {}` crashed the UI).
    assert api.cache._snapshot is None
    with client.websocket_connect("/ws") as ws:
        got = ws.receive_json()
        assert got.get("data") == []
