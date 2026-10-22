# app/health_rules.py
from enum import Enum

class Color(Enum):
    GREEN = "GREEN"; ORANGE = "ORANGE"; RED = "RED"; UNKNOWN = "UNKNOWN"

class HealthRules:
    @staticmethod
    def job_color(execution_status: str, error_message: str) -> Color:
        es = (execution_status or "").strip()
        em = (error_message or "").strip()
        if es == "Ready to run" and em == "":
            return Color.GREEN
        if es == "Job ended with error(s)":
            low = em.lower()
            if "killed by user" in low or "timeout trigger" in low:
                return Color.ORANGE
            return Color.RED
        if es in ("Running", "Queued", "Paused"):
            # Transitional states are healthy ONLY with an empty error; a non-empty
            # error_message here is a live failure signal -> RED. Spec §5.1 defines
            # no transitional state; this deliberate extension never claims GREEN
            # over a real error (would mask a failure in a 100%-green server).
            return Color.GREEN if em == "" else Color.RED
        return Color.UNKNOWN            # anything else (including blank status)

    @staticmethod
    def server_color(metrics: dict) -> Color:
        """metrics: {red, orange, green, unknown, unreachable}"""
        if metrics["unreachable"] or metrics.get("total", 0) == 0:
            return Color.UNKNOWN         # ingestion failed / no data — never lie GREEN
        if metrics["red"] >= 1:
            return Color.RED             # sum(JobsRED) >= 1
        if metrics["orange"] >= 1 and metrics["red"] == 0:
            return Color.ORANGE          # sum(JobsRED) = 0 AND sum(JobsORANGE) >= 1
        if metrics["green"] == metrics["total"]:
            return Color.GREEN           # GREEN iff 100% healthy
        return Color.UNKNOWN
