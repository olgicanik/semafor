# Talend Job Conductor Monitor

Real-time monitoring dashboard for Bosch Talend Job Conductor (TAC) servers — a single
pane of glass over ~5,000 jobs across 5 TAC nodes. End-to-end prototype: encrypted `.env`
secrets → ingestion worker (live TAC **or** offline simulator) → SQLite cache → semaphore
rule engine → static JSON cache → FastAPI REST + WebSocket API → React UI, plus an AI
diagnostics adapter with an offline rule-based fallback.

```
worker ──ingest──> SQLite ──build_snapshot──> status.json ──watcher──> FastAPI ──REST/WS──> React UI
                                                    ^                                             ^
                                              (atomic publish)                    (never polls; live pushes)
```

## Quick start (offline demo — no secrets, no `.env` required)

```bash
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt

# 1. ingestion worker (one pass = writes talend_monitor.db + status.json)
.venv\Scripts\python -m app.worker_main --once --sim

# 2. API + WebSocket service
.venv\Scripts\python -m uvicorn app.api:app --host 127.0.0.1 --port 8000

# 3. UI (dev server proxies /api and /ws to :8000)
cd web && npm install && npm run dev
```

Open `http://localhost:5173`. You'll see 5 servers with semaphore dots (RED blink), a
drill-down list sorted failed-first, and per-job AI verdicts rendered from the pre-computed
cache (zero live LLM calls on the request path).

Run the worker continuously (default `--interval 30`):

```bash
.venv\Scripts\python -m app.worker_main          # or --interval 60
```

## Live TAC mode

Fill in `.env` (copy from `.env.example`). Encrypted values are produced locally by:

```bash
.venv\Scripts\python scripts/encrypt_env.py --password 12345 '{"TAC_PASSWORD_1": "..."}'
```

Set `TAC_URL_1`, `TAC_USERNAME`, `TAC_PASSWORD_1_ENCRYPTED`, … then run
`python -m app.worker_main --once --source auto` (auto = live if any `TAC_URL_n` is
configured, else the simulator). `--source sim|live` overrides the `INGESTION_SOURCE` env var.

### TAC SSO-trap caveat

The live adapter detects the stfs.bosch.com SSO login redirect (an HTML response where JSON
is expected) and marks that server **UNKNOWN** instead of parsing HTML as JSON. A server that
returns zero tasks on any pass — SSO trap or node down — renders UNKNOWN and its stale rows
are dropped, so yesterday's GREEN is never shown as current.

## Master password

The default master password is `12345` (prototype only). Override it with the
`SEMAFOR_MASTER_PASSWORD` line in `.env` or the same-named environment variable (env var
wins). Production must store the master password in a vault, not the repo — the fixed salt
in `app/secrets_env.py` is a documented prototype choice, not a production mechanism.

## Security notes (prototype)

- `.env` is gitignored and never committed; passwords are stored ciphertext (AES-GCM, key
  derived via PBKDF2-SHA256). Missing a required var → hard fail, never logged.
- CORS `allow_origins=["*"]` is **dev/prototype only**. Production binds explicit origins
  and serves the API behind a reverse proxy on the same origin as the UI.
- `tac_live.py` logs only the server name and exception type — never the URL carrying the
  base64 auth blob.

## Tests

```bash
.venv\Scripts\python -m pytest tests/ -q      # 40 tests, all green
```

Covers the encrypted-`.env` loader, the semaphore rule engine, the SQLite store, the
deterministic simulator, the API + WebSocket watcher bridge, diagnostics fallback, and the
worker's token-ROI carry-forward + downed-node semantics.
