# tests/test_health_rules.py
import pytest
from app.health_rules import Color, HealthRules


def test_job_color_full_truth_table():
    assert HealthRules.job_color("Ready to run", "") is Color.GREEN
    assert HealthRules.job_color("Ready to run", "  ") is Color.GREEN
    assert HealthRules.job_color("Job ended with error(s)", "Job killed by user") is Color.ORANGE
    assert HealthRules.job_color("Job ended with error(s)", "timeout trigger after 600000 ms") is Color.ORANGE
    assert HealthRules.job_color(
        "Job ended with error(s)",
        "java.sql.SQLRecoverableException: IO Error: The Network Adapter could not establish the connection",
    ) is Color.RED
    assert HealthRules.job_color("Running", "") is Color.GREEN
    assert HealthRules.job_color("Queued", "") is Color.GREEN
    assert HealthRules.job_color("Paused", "") is Color.GREEN
    # transitional state carrying a live error is RED (v6: never lie GREEN)
    assert HealthRules.job_color("Running", "ora-12170: tns connect timeout") is Color.RED
    assert HealthRules.job_color("", "") is Color.UNKNOWN
    assert HealthRules.job_color(None, None) is Color.UNKNOWN
    assert HealthRules.job_color("Waiting", "") is Color.UNKNOWN


def _m(red=0, orange=0, green=0, unknown=0, total=None, unreachable=False):
    return {"red": red, "orange": orange, "green": green,
            "unknown": unknown, "total": total if total is not None else red + orange + green + unknown,
            "unreachable": unreachable}


def test_server_color():
    assert HealthRules.server_color(_m(red=1, green=999)) is Color.RED
    assert HealthRules.server_color(_m(orange=1, green=999)) is Color.ORANGE
    assert HealthRules.server_color(_m(green=1000)) is Color.GREEN
    assert HealthRules.server_color(_m(green=999, unknown=1)) is Color.UNKNOWN   # not 100% and no red/orange
    assert HealthRules.server_color(_m(green=100, unreachable=True)) is Color.UNKNOWN
    assert HealthRules.server_color(_m(total=0)) is Color.UNKNOWN
