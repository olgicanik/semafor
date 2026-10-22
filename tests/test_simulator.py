# tests/test_simulator.py
from app.config import DEFAULT_SIM_SERVERS
from app.health_rules import Color, HealthRules
from app.models import TaskStatus
from app.sources.simulator import SimulatorSource


def _servers():
    out = []
    for item in DEFAULT_SIM_SERVERS.split(","):
        name, cat, ip = [p.strip() for p in item.split(":")]
        out.append({"name": name, "category": cat, "ip": ip})
    return out


async def test_total_is_5000():
    fetched = await SimulatorSource(_servers()).fetch()
    assert sum(len(tasks) for tasks in fetched.values()) == 5000


async def test_deterministic_same_seed():
    a = await SimulatorSource(_servers(), seed=42).fetch()
    b = await SimulatorSource(_servers(), seed=42).fetch()
    first = next(iter(a.values()))
    assert [t.job_id for t in first[:100]] == [t.job_id for t in b[next(iter(b))][:100]]
    # full byte-identical statuses per job
    for name in a:
        assert [(t.job_id, t.execution_status, t.error_message) for t in a[name]] == \
               [(t.job_id, t.execution_status, t.error_message) for t in b[name]]


async def test_prod_servers_have_zero_red():
    fetched = await SimulatorSource(_servers()).fetch()
    for name, tasks in fetched.items():
        cat = next(s["category"] for s in _servers() if s["name"] == name)
        if cat == "PROD":
            assert all(HealthRules.job_color(t.execution_status, t.error_message) is not Color.RED
                       for t in tasks)


async def test_all_rows_valid_taskstatus():
    fetched = await SimulatorSource(_servers()).fetch()
    for tasks in fetched.values():
        for t in tasks:
            assert isinstance(t, TaskStatus)
            assert isinstance(t.job_id, int)


async def test_job_ids_unique_across_servers():
    fetched = await SimulatorSource(_servers()).fetch()
    ids = [t.job_id for tasks in fetched.values() for t in tasks]
    assert len(ids) == len(set(ids))
