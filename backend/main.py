"""Traffic Light Job Monitoring — FastAPI backend (fully mocked).

Serves a local JSON "store" (backend/servers_config.json — created on first
boot if missing), simulates job-status transitions on every poll, and exposes
the REST API consumed by the React/Tailwind dashboard.

Swapping mocks for real connectors is deliberately localised:
  * auth      -> replace auth_adapters.py adapters with real transports
  * jobs      -> replace the store-backed jobs with `tac_status.py`-style fetches
  * analytics -> recompute inside _compute_analytics()
Routes never change.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import random
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from auth_adapters import AuthAdapterError, AuthManager
from schemas import (
    AnalyticsResponse,
    AuthConfig,
    EnvironmentUptime,
    HistoryEntry,
    Job,
    ServerWithJobs,
    TrafficStatus,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("traffic-light")

CONFIG_PATH = Path(__file__).resolve().parent / "servers_config.json"
MAX_HISTORY = 500        # per-server cap so the JSON store never grows unbounded
FLIP_PROBABILITY = 0.10  # per-job chance of a status flip on each poll

STATUS_MESSAGES = {
    TrafficStatus.GREEN: "Running - all checks passing",
    TrafficStatus.YELLOW: "Stopped - paused, waiting for a slot",
    TrafficStatus.RED: "Error - last run failed",
}

# ---------------------------------------------------------------------------
# Default seed. Boot/`--seed` materialises this exact data into
# backend/servers_config.json (see §4.5 for the file).
#
# The seed history is deliberately self-consistent with the analytics formulas:
#   dev  = all-green  -> uptime 100.0%   qa  = (50.0 + 33.33)/2 -> 41.66
#   prod = (20.0 + 100.0)/2 -> 60.0
# red transitions in the last 24 h (at seed time) = 6; most-unstable = mainframe.
# ---------------------------------------------------------------------------
DEFAULT_SEED: list[dict[str, Any]] = [
    {
        "id": "srv-prod-mainframe",
        "name": "Prod Mainframe Bridge",
        "environment": "prod",
        "auth_type": "ssh",
        "auth_credentials": {"ssh_private_key": "/keys/prod_mainframe"},
        "is_pinned": True,
        "jobs": [
            {"id": "job-mf-sync", "name": "Payroll Sync", "status": "green",
             "last_run": "2026-10-22T08:00:00+00:00", "message": "Running - all checks passing"},
            {"id": "job-mf-report", "name": "Daily Ops Report", "status": "red",
             "last_run": "2026-10-22T08:05:00+00:00", "message": "Error - last run failed"},
            {"id": "job-mf-archive", "name": "Archive Rotation", "status": "yellow",
             "last_run": "2026-10-22T07:50:00+00:00", "message": "Stopped - paused, waiting for a slot"},
        ],
        "history": [
            {"status": "red", "timestamp": "2026-10-22T08:05:00+00:00", "error_count": 1},
            {"status": "red", "timestamp": "2026-10-22T02:10:00+00:00", "error_count": 1},
            {"status": "red", "timestamp": "2026-10-21T20:30:00+00:00", "error_count": 1},
            {"status": "green", "timestamp": "2026-10-21T09:00:00+00:00", "error_count": 0},
            {"status": "yellow", "timestamp": "2026-10-20T19:00:00+00:00", "error_count": 0},
        ],
    },
    {
        "id": "srv-dev-gateway",
        "name": "Dev API Gateway",
        "environment": "dev",
        "auth_type": "api_key",
        "auth_credentials": {"token": "dev-token-7f3a"},
        "is_pinned": True,
        "jobs": [
            {"id": "job-gw-auth", "name": "OAuth Token Refresh", "status": "green",
             "last_run": "2026-10-22T08:15:00+00:00", "message": "Running - all checks passing"},
            {"id": "job-gw-sync", "name": "Config Sync", "status": "yellow",
             "last_run": "2026-10-22T07:40:00+00:00", "message": "Stopped - paused, waiting for a slot"},
            {"id": "job-gw-metrics", "name": "Metrics Export", "status": "green",
             "last_run": "2026-10-22T08:00:00+00:00", "message": "Running - all checks passing"},
        ],
        "history": [
            {"status": "green", "timestamp": "2026-10-22T08:15:00+00:00", "error_count": 0},
            {"status": "green", "timestamp": "2026-10-21T16:00:00+00:00", "error_count": 0},
            {"status": "green", "timestamp": "2026-10-21T09:30:00+00:00", "error_count": 0},  # v2: was yellow -> all-green dev
        ],
    },
    {
        "id": "srv-qa-payments",
        "name": "QA Payments Core",
        "environment": "qa",
        "auth_type": "basic_auth",
        "auth_credentials": {"username": "qa_bot", "password": "qa-pass-123"},
        "is_pinned": False,
        "jobs": [
            {"id": "job-pay-authz", "name": "Authorization Checks", "status": "green",
             "last_run": "2026-10-22T08:20:00+00:00", "message": "Running - all checks passing"},
            {"id": "job-pay-settle", "name": "Settlement Run", "status": "red",
             "last_run": "2026-10-22T08:05:00+00:00", "message": "Error - last run failed"},
            {"id": "job-pay-recon", "name": "Reconciliation", "status": "green",
             "last_run": "2026-10-22T07:55:00+00:00", "message": "Running - all checks passing"},
        ],
        "history": [
            {"status": "green", "timestamp": "2026-10-22T08:20:00+00:00", "error_count": 0},
            {"status": "red", "timestamp": "2026-10-22T08:05:00+00:00", "error_count": 1},
            {"status": "green", "timestamp": "2026-10-21T18:45:00+00:00", "error_count": 0},
            {"status": "yellow", "timestamp": "2026-10-21T11:00:00+00:00", "error_count": 0},
        ],
    },
    {
        "id": "srv-qa-pipeline",
        "name": "QA Data Pipeline",
        "environment": "qa",
        "auth_type": "proxy",
        "auth_credentials": {"proxy_url": "http://proxy-qa:8080"},
        "is_pinned": True,
        "jobs": [
            {"id": "job-pl-ingest", "name": "Raw Ingestion", "status": "yellow",
             "last_run": "2026-10-22T08:10:00+00:00", "message": "Stopped - paused, waiting for a slot"},
            {"id": "job-pl-transform", "name": "Feature Transform", "status": "green",
             "last_run": "2026-10-22T07:30:00+00:00", "message": "Running - all checks passing"},
            {"id": "job-pl-publish", "name": "Dataset Publish", "status": "red",
             "last_run": "2026-10-22T08:00:00+00:00", "message": "Error - last run failed"},
        ],
        "history": [
            {"status": "red", "timestamp": "2026-10-22T08:00:00+00:00", "error_count": 1},
            {"status": "green", "timestamp": "2026-10-21T19:00:00+00:00", "error_count": 0},
            {"status": "red", "timestamp": "2026-10-21T12:15:00+00:00", "error_count": 1},
        ],
    },
    {
        "id": "srv-prod-fraud",
        "name": "Prod Fraud Scanner",
        "environment": "prod",
        "auth_type": "api_key",
        "auth_credentials": {"token": "prod-token-9912"},
        "is_pinned": False,
        "jobs": [
            {"id": "job-fr-scan", "name": "Transaction Scan", "status": "green",
             "last_run": "2026-10-22T08:25:00+00:00", "message": "Running - all checks passing"},
            {"id": "job-fr-flag", "name": "Flag Review Sync", "status": "green",
             "last_run": "2026-10-22T07:20:00+00:00", "message": "Running - all checks passing"},
        ],
        "history": [
            {"status": "green", "timestamp": "2026-10-22T08:25:00+00:00", "error_count": 0},
            {"status": "green", "timestamp": "2026-10-21T17:30:00+00:00", "error_count": 0},
        ],
    },
]

# ---------------------------------------------------------------------------
# Store (JSON read/write) — a single source of truth on disk.
# ---------------------------------------------------------------------------
_store_lock = threading.Lock()


def _write_store(servers: list[ServerWithJobs]) -> None:
    """Persist the store as a JSON array of servers, atomically (v3 G4).

    Writes a ``.json.tmp`` sibling and renames it over the real file so a torn
    write mid-poll can never leave a corrupt servers_config.json behind; the
    corrupt-store re-seed in _load_store stays as a backstop, not the norm.
    """
    payload = json.dumps([s.model_dump(mode="json") for s in servers], indent=2)
    with _store_lock:
        tmp_path = CONFIG_PATH.with_name(CONFIG_PATH.name + ".tmp")
        tmp_path.write_text(payload + "\n", encoding="utf-8")
        os.replace(tmp_path, CONFIG_PATH)


def _seed_store() -> list[ServerWithJobs]:
    """Overwrite the store with DEFAULT_SEED and return the parsed models."""
    servers = [ServerWithJobs.model_validate(entry) for entry in DEFAULT_SEED]
    _write_store(servers)
    logger.info("Re-seeded %d servers into %s", len(servers), CONFIG_PATH)
    return servers


def _load_store() -> list[ServerWithJobs]:
    """Read the store; create (or re-seed) it when missing or corrupt."""
    if not CONFIG_PATH.exists():
        logger.warning("servers_config.json missing — writing default seed.")
        return _seed_store()
    try:
        raw = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        return [ServerWithJobs.model_validate(entry) for entry in raw]
    except (json.JSONDecodeError, ValueError) as exc:
        logger.error("servers_config.json invalid (%s) — resetting to default seed.", exc)
        return _seed_store()


def _get_server(servers: list[ServerWithJobs], server_id: str) -> ServerWithJobs:
    """Return one server from the in-memory list or raise 404."""
    for server in servers:
        if server.id == server_id:
            return server
    raise HTTPException(status_code=404, detail=f"Server {server_id!r} not found")


def _auth_headers_or_400(server: ServerWithJobs) -> dict[str, str]:
    """Resolve a server's auth adapter; surface config errors as HTTP 400."""
    auth = AuthConfig(auth_type=server.auth_type, auth_credentials=server.auth_credentials)
    try:
        return AuthManager.get_adapter(auth).get_headers()
    except AuthAdapterError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Dynamic state simulation ("mock job engine")
# ---------------------------------------------------------------------------
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _random_new_status(current: TrafficStatus) -> TrafficStatus:
    """Pick any status other than the current one (green→red, red→yellow, …)."""
    return random.choice([s for s in TrafficStatus if s is not current])


def simulate_server_state(
    server: ServerWithJobs, *, p: float = FLIP_PROBABILITY
) -> list[HistoryEntry]:
    """Flip 1–2 jobs' status (each with ~10% probability) and log transitions.

    Every flip appends a HistoryEntry (new status, timestamp, current red-job
    count) to the server's history so analytics and future plotting have data.
    """
    if not server.jobs:
        return []
    flipped: list[Job] = [job for job in server.jobs if random.random() < p]
    if len(flipped) > 2:
        flipped = random.sample(flipped, 2)

    entries: list[HistoryEntry] = []
    timestamp = _now()
    for job in flipped:
        job.status = _random_new_status(job.status)
        job.message = STATUS_MESSAGES[job.status]
        job.last_run = timestamp
        entries.append(
            HistoryEntry(
                status=job.status,
                timestamp=timestamp,
                error_count=sum(1 for j in server.jobs if j.status == TrafficStatus.RED),
            )
        )
    if entries:
        server.history.extend(entries)
        server.history = server.history[-MAX_HISTORY:]
    return entries


# ---------------------------------------------------------------------------
# Analytics (mock stats, real formulas over the store)
# ---------------------------------------------------------------------------
def _server_uptime_percent(server: ServerWithJobs) -> float:
    """Share of history entries in GREEN (no history ⇒ assume 100%)."""
    if not server.history:
        return 100.0
    green = sum(1 for e in server.history if e.status == TrafficStatus.GREEN)
    return round(green / len(server.history) * 100, 2)


def _compute_analytics(
    servers: list[ServerWithJobs], *, now: datetime | None = None
) -> AnalyticsResponse:
    now = now or _now()
    cutoff = now - timedelta(hours=24)

    uptimes: dict[str, list[float]] = {}
    for server in servers:
        uptimes.setdefault(server.environment.value, []).append(_server_uptime_percent(server))

    average_uptime = [
        EnvironmentUptime(
            environment=env,
            average_uptime_percent=round(sum(values) / len(values), 2) if values else 100.0,
        )
        for env, values in sorted(uptimes.items())
    ]

    transitions_24h = sum(
        1 for s in servers for e in s.history if e.timestamp >= cutoff
    )
    red_24h = sum(
        1 for s in servers
        for e in s.history
        if e.status == TrafficStatus.RED and e.timestamp >= cutoff
    )
    failure_rate = round(red_24h / max(transitions_24h, 1) * 100, 2)

    unstable: ServerWithJobs | None = None
    unstable_red = -1
    for server in servers:
        red_count = sum(1 for e in server.history if e.status == TrafficStatus.RED)
        if red_count > unstable_red or (
            red_count == unstable_red and unstable is not None and server.name < unstable.name
        ):
            unstable, unstable_red = server, red_count

    return AnalyticsResponse(
        average_uptime_per_environment=average_uptime,
        total_red_errors_last_24h=red_24h,
        failure_rate_percent=failure_rate,
        most_unstable_server=unstable.id if unstable is not None and unstable_red > 0 else None,
        generated_at=now,
    )


# ---------------------------------------------------------------------------
# App + routes
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Traffic Light Job Monitoring API",
    description="Mock job-monitoring backend for the Traffic Light dashboard.",
    version="0.1.0",
)

# Hackathon dev setup: the Vite dev server (http://localhost:5173) must be able
# to call in from any origin. Tighten for production.
# NOTE: starlette's CORS middleware only emits CORS response headers when the
# request carries an `Origin` header — real browsers always do, so the browser
# experience is unaffected (see test_cors_header_present, which sends Origin).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/servers", response_model=list[ServerWithJobs])
def list_servers() -> list[ServerWithJobs]:
    """Polling endpoint: validate auth, simulate job transitions, return all."""
    servers = _load_store()
    for server in servers:
        _auth_headers_or_400(server)  # surfacing adapter gaps loudly beats silent config rot
        simulate_server_state(server)
    _write_store(servers)
    return servers


@app.get("/api/servers/{server_id}/jobs", response_model=list[Job])
def list_server_jobs(server_id: str) -> list[Job]:
    """One server's jobs (no simulation on this endpoint)."""
    servers = _load_store()
    return _get_server(servers, server_id).jobs


@app.post("/api/servers/{server_id}/pin", response_model=ServerWithJobs)
def pin_server(server_id: str) -> ServerWithJobs:
    servers = _load_store()
    server = _get_server(servers, server_id)
    server.is_pinned = True
    _write_store(servers)
    return server


@app.post("/api/servers/{server_id}/unpin", response_model=ServerWithJobs)
def unpin_server(server_id: str) -> ServerWithJobs:
    servers = _load_store()
    server = _get_server(servers, server_id)
    server.is_pinned = False
    _write_store(servers)
    return server


@app.post("/api/servers", response_model=ServerWithJobs, status_code=201)
def create_server(payload: ServerWithJobs) -> ServerWithJobs:
    """Add a new server (created via the Add-New-Server modal).

    The client supplies a unique id (crypto.randomUUID()); history is reset so
    a brand-new server starts with a clean slate regardless of what was sent.
    """
    servers = _load_store()
    if any(s.id == payload.id for s in servers):
        raise HTTPException(status_code=409, detail=f"Server id {payload.id!r} already exists")
    payload.is_pinned = False
    payload.history = []
    servers.append(payload)
    _write_store(servers)
    return payload


@app.get("/api/analytics", response_model=AnalyticsResponse)
def analytics() -> AnalyticsResponse:
    """Mock analytics computed from the stored history."""
    return _compute_analytics(_load_store())


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(description="Traffic Light Job Monitoring backend")
    parser.add_argument(
        "--seed",
        action="store_true",
        help="rewrite servers_config.json from DEFAULT_SEED and exit",
    )
    parser.add_argument("--port", type=int, default=8000, help="uvicorn port (default: 8000)")
    args = parser.parse_args()

    if args.seed:
        _seed_store()
        return

    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
