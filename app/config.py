# app/config.py
import os
from dataclasses import dataclass
from .secrets_env import load_all

# Demo nodes baked in so `--once --sim` works on a fresh checkout with no .env:
# 2 PROD + 1 QA + 1 DEV (SL4) and 1 QA (SL3) -> matches the v1 spec topology.
DEFAULT_SIM_SERVERS = (
    "Business_Lake_QA_JDK11:QA:10.12.3.4,"
    "Business_Lake_Prod_SL3:PROD:10.12.3.5,"
    "Business_Lake_Prod_SL4:PROD:10.12.3.6,"
    "Business_Lake_Dev_SL4:DEV:10.12.3.7,"
    "Etl_Staging_SL4:QA:10.12.3.8")

@dataclass
class Settings:
    servers: list                     # [{name, ip, category, url?, password?}, ...]
    source_mode: str                  # 'auto' | 'sim' | 'live'
    verify_ssl: bool
    api_host: str
    api_port: int
    db_path: str
    tac_username: str
    gemini_key: str
    gemini_endpoint: str

    def make_source(self):
        from .sources.simulator import SimulatorSource
        from .sources.tac_live import TacLiveSource
        live = [s for s in self.servers if s.get("url")]
        mode = self.source_mode
        if mode == "auto":
            mode = "live" if live else "sim"
        if mode == "sim":
            return SimulatorSource(self.servers)
        if mode == "live" and not live:
            raise RuntimeError("INGESTION_SOURCE=live but no TAC_URL_n is configured")
        return TacLiveSource(live, username=self.tac_username, verify_ssl=self.verify_ssl)

def build_settings() -> Settings:
    env = load_all()                  # *_ENCRYPTED entries are decrypted in place
    servers: list = []
    for i in range(1, 6):             # live nodes: 1..5 from TAC_URL_n / password
        url = (env.get(f"TAC_URL_{i}") or "").strip()
        pwd = (env.get(f"TAC_PASSWORD_{i}_ENCRYPTED") or "").strip()
        if url and not pwd:
            raise RuntimeError(f"TAC_URL_{i} set but TAC_PASSWORD_{i}_ENCRYPTED missing")
        if url:
            # PLACEHOLDER metadata: no TAC metadata source exists, so live nodes get
            # generic names (tac-N), category PROD and ip 0.0.0.0 — these are NOT real
            # addresses. Production would join a server registry; the dashboard's
            # real values in live mode are the per-job statuses/errors, not these.
            servers.append({"name": f"tac-{i}", "category": "PROD", "ip": "0.0.0.0",
                            "url": url, "password": pwd})
    if not servers:                   # offline path: SIM_SERVERS env or the baked defaults
        spec = (env.get("SIM_SERVERS") or "").strip() or DEFAULT_SIM_SERVERS
        for item in spec.split(","):
            if not item.strip():
                continue
            name, cat, ip = [p.strip() for p in item.split(":")]
            servers.append({"name": name, "category": cat, "ip": ip})
    if not servers:
        raise RuntimeError("No servers configured (set SIM_SERVERS or TAC_URL_n)")
    if any(s.get("url") for s in servers) and not (env.get("TAC_USERNAME") or "").strip():
        # live mode without a service account would only fail per-server at fetch time;
        # fail fast at boot instead (never invent or log a username/credential).
        raise RuntimeError("TAC_URL_n is configured but TAC_USERNAME is missing")
    return Settings(
        servers=servers,
        source_mode=(env.get("INGESTION_SOURCE") or "auto").strip().lower(),
        verify_ssl=(env.get("TAC_VERIFY_SSL") or "0") == "1",
        api_host=env.get("API_HOST") or "127.0.0.1",
        api_port=int(env.get("API_PORT") or "8000"),
        db_path=env.get("TALEND_DB_PATH") or "talend_monitor.db",
        tac_username=env.get("TAC_USERNAME") or "",
        gemini_key=env.get("GEMINI_API_KEY") or "",
        gemini_endpoint=env.get("GEMINI_ENDPOINT") or "")
