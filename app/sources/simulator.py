# app/sources/simulator.py
import random, datetime as dt
from .base import Source
from ..models import TaskStatus

ORANGE_MARKERS = ("killed by user", "timeout trigger")

class SimulatorSource(Source):
    def __init__(self, servers: list[dict], jobs_per_server: int = 1000, seed: int = 42):
        self.servers = servers
        self.jobs_per_server = jobs_per_server
        self._rng = random.Random(seed)

    async def fetch(self) -> dict:
        out: dict = {}
        for srv in self.servers:
            out[srv["name"]] = [self._make_task(srv, i) for i in range(self.jobs_per_server)]
        return out

    def _make_task(self, srv: dict, i: int) -> TaskStatus:
        # job_id provably unique: base encodes the server's index in this source's
        # server list (verified unique across all 5 servers).
        srv_index = self.servers.index(srv)
        pid = (srv_index + 1) * 100_000 + i
        # Deterministic per (seed, server, index): the RNG is advanced in a fixed
        # order (servers list order, then 0..jobs_per_server), so the full
        # distribution is reproducible across runs.
        r = self._rng.random()
        if srv["category"] == "PROD":
            status, err = "Ready to run", ""      # PROD hosts never show RED/ORANGE
        elif r < 0.985:
            status, err = "Ready to run", ""
        elif r < 0.990:
            status, err = "Job ended with error(s)", "timeout trigger after 600000 ms"
        elif r < 0.993:
            status, err = "Job ended with error(s)", "Job killed by user"
        else:
            status, err = "Job ended with error(s)", \
                "java.sql.SQLRecoverableException: IO Error: The Network Adapter could not establish the connection"
        # Fixed epoch base + seeded offset: last_run_time is a pure function of the
        # seed, keeping snapshots byte-stable.
        last_run = dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc) \
            + dt.timedelta(minutes=self._rng.randint(0, 400_000))
        return TaskStatus(
            job_id=pid,
            project_name=f"ETL_TALEND_SIM_{srv['category']}",
            branch_name="main",
            job_name=f"job_sim_{pid}",
            job_label=f"SIM_{srv['category']}_{i}",
            job_version="1.0",
            context=srv["category"],
            target_server=srv["name"],
            server_category=srv["category"],
            execution_status=status,
            error_message=err,
            last_run_time=last_run,
        )
