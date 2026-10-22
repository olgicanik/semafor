"""API tests (fastapi.testclient) + unit tests for the simulator and analytics.

Storage tests point CONFIG_PATH at a temp file via monkeypatch so the
committed servers_config.json is never touched.
"""
import json
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

import main
from schemas import ServerWithJobs


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """TestClient whose JSON store lives in a temp file; simulation off."""
    monkeypatch.setattr(main, "CONFIG_PATH", tmp_path / "servers_config.json")
    monkeypatch.setattr(main, "simulate_server_state", lambda server: [])
    return TestClient(main.app)


def test_store_is_created_when_missing(client, tmp_path):
    assert not (tmp_path / "servers_config.json").exists()
    resp = client.get("/api/servers")
    assert resp.status_code == 200
    assert (tmp_path / "servers_config.json").exists()


def test_list_servers_returns_nested_jobs(client):
    servers = client.get("/api/servers").json()
    assert len(servers) == 5
    assert {s["environment"] for s in servers} >= {"dev", "qa", "prod"}
    assert all("jobs" in s and len(s["jobs"]) >= 2 for s in servers)


def test_pin_unpin_roundtrip_persists(client, tmp_path):
    sid = "srv-dev-gateway"
    assert client.post(f"/api/servers/{sid}/pin").json()["is_pinned"] is True
    assert client.post(f"/api/servers/{sid}/unpin").json()["is_pinned"] is False
    raw = json.loads((tmp_path / "servers_config.json").read_text(encoding="utf-8"))
    by_id = {s["id"]: s for s in raw}
    assert by_id[sid]["is_pinned"] is False


def test_unknown_server_404(client):
    assert client.post("/api/servers/nope/pin").status_code == 404
    assert client.get("/api/servers/nope/jobs").status_code == 404


def test_missing_adapter_surfaces_as_400(client, monkeypatch):
    """An auth_type with no registered adapter must not fail silently."""
    from auth_adapters import AuthManager

    monkeypatch.setitem(AuthManager._registry, "ssh", None)  # break one adapter
    assert client.get("/api/servers").status_code == 400


def test_create_server_201_and_duplicate_409(client):
    payload = {"id": "srv-new", "name": "New Box", "environment": "dev",
               "auth_type": "api_key", "auth_credentials": {"token": "t"}}
    created = client.post("/api/servers", json=payload)
    assert created.status_code == 201
    assert created.json()["is_pinned"] is False and created.json()["history"] == []
    assert client.post("/api/servers", json=payload).status_code == 409
    ids = {s["id"] for s in client.get("/api/servers").json()}
    assert "srv-new" in ids


def test_cors_header_present(client):
    # Browsers send an Origin header on cross-origin requests; recent Starlette
    # only emits CORS response headers when the request carries one, so the
    # test must send it too (mirrors real browser behaviour).
    resp = client.get("/api/servers", headers={"Origin": "http://localhost:5173"})
    assert resp.headers["access-control-allow-origin"] == "*"


def test_analytics_endpoint_shape(client):
    body = client.get("/api/analytics").json()
    assert "average_uptime_per_environment" in body
    assert "total_red_errors_last_24h" in body
    assert "failure_rate_percent" in body
    assert body["most_unstable_server"] == "srv-prod-mainframe"


# --- simulator (unit) -------------------------------------------------------

def test_simulator_flips_jobs_and_logs_history(monkeypatch):
    server = ServerWithJobs.model_validate(main.DEFAULT_SEED[1])  # dev gateway (3 jobs)
    before = {j.id: j.status for j in server.jobs}
    monkeypatch.setattr(main.random, "random", lambda: 0.05)  # always below p
    entries = main.simulate_server_state(server)
    assert len(entries) == 2  # capped at 2 flips per poll
    assert server.history[-2:] == entries
    changed = [j.id for j in server.jobs if j.status != before[j.id]]
    assert len(changed) == 2
    assert all(e.timestamp.tzinfo is not None for e in entries)


def test_simulator_no_flip_above_probability(monkeypatch):
    server = ServerWithJobs.model_validate(main.DEFAULT_SEED[1])
    history_len = len(server.history)
    monkeypatch.setattr(main.random, "random", lambda: 0.99)  # above p
    assert main.simulate_server_state(server) == []
    assert len(server.history) == history_len


def test_history_is_capped(monkeypatch):
    server = ServerWithJobs.model_validate(main.DEFAULT_SEED[1])
    server.history = server.history[:1]
    monkeypatch.setattr(main.random, "random", lambda: 0.05)
    for _ in range(260):  # 2 flips/call -> well past MAX_HISTORY
        main.simulate_server_state(server)
    assert len(server.history) <= main.MAX_HISTORY


# --- analytics (unit) -------------------------------------------------------

def test_analytics_computed_from_fixed_store(tmp_path, monkeypatch):
    # Deterministic isolation (v3 G3): seed an isolated temp store from
    # DEFAULT_SEED instead of reading the live committed servers_config.json —
    # the simulator's flips from a live demo would drift the real store and
    # make this fixed-now test fail.
    monkeypatch.setattr(main, "CONFIG_PATH", tmp_path / "servers_config.json")
    main._seed_store()
    now = datetime(2026, 10, 22, 9, 0, tzinfo=timezone.utc)
    result = main._compute_analytics(main._load_store(), now=now)

    assert result.most_unstable_server == "srv-prod-mainframe"  # 3 red transitions
    assert result.total_red_errors_last_24h == 6  # reds after 2026-10-21T09:00Z cutoff
    assert result.failure_rate_percent > 0
    envs = [u.environment.value for u in result.average_uptime_per_environment]
    assert envs == sorted(envs)  # deterministic ordering
    dev = next(u for u in result.average_uptime_per_environment
               if u.environment.value == "dev")
    assert dev.average_uptime_percent == 100.0  # dev gateway history is all green (v2 seed)


def test_analytics_empty_store_does_not_crash(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "CONFIG_PATH", tmp_path / "servers_config.json")
    (tmp_path / "servers_config.json").write_text("[]", encoding="utf-8")
    result = main._compute_analytics(main._load_store())
    assert result.most_unstable_server is None
    assert result.total_red_errors_last_24h == 0
    assert result.failure_rate_percent == 0.0
