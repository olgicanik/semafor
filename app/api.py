# app/api.py
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from .cache import StaticCache

cache = StaticCache()
_ws_clients: set[WebSocket] = set()

def _fingerprint(path: Path) -> "tuple | None":
    """(mtime_ns, size) — cheap change detector; None when the file is absent."""
    try:
        st = path.stat()
        return (st.st_mtime_ns, st.st_size)
    except OSError:
        return None

async def _safe_send(ws: WebSocket, snap: dict) -> None:
    """Push a snapshot, discarding sockets that have closed since we listed them."""
    try:
        await ws.send_json(snap)
    except Exception:                                 # noqa: BLE001 - closed socket
        _ws_clients.discard(ws)

async def _watcher(poll_s: float = 0.5) -> None:
    """Bridge the worker/API process gap: reload status.json on change and push."""
    last = None
    while True:
        await asyncio.sleep(poll_s)
        path = Path(cache.path)                       # resolve per-iteration (test seam)
        fp = _fingerprint(path)
        if fp is not None and fp != last:
            last = fp
            cache.load()
            snap = cache.snapshot
            if snap is not None:
                for ws in list(_ws_clients):
                    asyncio.create_task(_safe_send(ws, snap))

@asynccontextmanager
async def lifespan(app: FastAPI):
    cache.load()                                   # restore last state at boot
    task = asyncio.create_task(_watcher())
    yield
    task.cancel()

app = FastAPI(title="Talend Job Conductor Monitor", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/api/v1/servers/status")
async def servers_status():
    snap = cache.snapshot or {"status": "success", "generated_at": None, "data": []}
    return {"status": "success", "generated_at": snap.get("generated_at"), "data": snap.get("data", [])}

@app.get("/api/v1/servers/{server_name}/jobs")
async def server_jobs(server_name: str, limit: int = 200, offset: int = 0):
    # failed-first order precomputed in build_snapshot (see Step 4); slice here
    jobs = (cache.snapshot or {}).get("jobs_by_server", {}).get(server_name, [])
    return {"status": "success", "server_name": server_name,
            "total_jobs": len(jobs),
            "jobs": jobs[offset:offset + limit]}

@app.get("/api/v1/jobs/{job_id}/details")
async def job_details(job_id: int):
    job = (cache.snapshot or {}).get("jobs_by_id", {}).get(str(job_id))
    return {"status": "success", "data": job} if job else {"status": "error", "data": None}

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    _ws_clients.add(ws)
    try:
        # Initial state push must carry a `data`-bearing shape even before the
        # first publish (mirrors the REST fallback in servers_status): App.jsx
        # maps snapshot.data, and `cache.snapshot or {}` would hand it {} ->
        # a blank-screen crash on cold start (v9: confirmed; regression-tested
        # in test_ws_initial_empty_snapshot_has_data).
        await ws.send_json(cache.snapshot or {"status": "success", "generated_at": None, "data": []})
        while True:
            await ws.receive_text()                     # keep-alive pings; idle socket
    except WebSocketDisconnect:
        _ws_clients.discard(ws)
    except Exception:                                   # noqa: BLE001 - cleanup on any close
        _ws_clients.discard(ws)
    finally:
        _ws_clients.discard(ws)
