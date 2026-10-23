# Traffic Light — Job Monitoring Dashboard

Mock job-monitoring dashboard: React + Vite frontend (pure CSS, Bosch-branded)
+ FastAPI backend.
Everything is mocked but modular — swap `backend/auth_adapters.py` and the mock
job engine for real connectors without touching the routes.

## Layout

    backend/            FastAPI app (schemas.py, auth_adapters.py, main.py)
                        servers_config.json  local JSON store (seeded on boot)
    frontend/           Vite + React 19, pure-CSS design system (src/styles tokens,
                        src/components domain decomposition, src/hooks, src/utils)
    tac_status.py       existing real TAC connector (unused by the mock)

## Run

Backend:
    cd backend
    python -m venv .venv
    source .venv/Scripts/activate        # Git Bash on Windows; .venv\Scripts\activate in cmd
    pip install -r requirements.txt
    python main.py --seed                # (re)generate servers_config.json
    python main.py --port 8000
    python -m pytest -q                  # run the test suite

Frontend:
    cd frontend
    npm install
    npm run test
    npm run dev                          # open http://localhost:5173

The dashboard polls GET /api/servers every 10 s; the backend randomly flips 1–2
job statuses per poll so the traffic lights shift live.
