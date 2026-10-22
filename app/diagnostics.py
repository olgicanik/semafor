# app/diagnostics.py
import json, re, logging
from abc import ABC, abstractmethod
import httpx
from .models import TaskStatus

log = logging.getLogger(__name__)

class DiagnosticsEngine(ABC):
    @abstractmethod
    async def diagnose(self, job: TaskStatus) -> dict:
        """-> {'error_summary': str, 'action_item': str}"""

class RuleBasedDiagnostics(DiagnosticsEngine):
    """Deterministic offline fallback — never raises, always returns a verdict."""
    _RULES = [
        (re.compile(r"Network Adapter|could not establish|IO Error", re.I),
         "Oracle DB connection failed due to network unreachable status.",
         "Verify outbound firewall/route to the DB server on port 1521."),
        (re.compile(r"timeout trigger", re.I),
         "Job hit scheduler timeout threshold.",
         "Review trigger timeout setting or job runtime duration."),
        (re.compile(r"killed by user", re.I),
         "Job was stopped by a user.",
         "Confirm whether the stop was intentional; no data fix needed."),
    ]
    async def diagnose(self, job: TaskStatus) -> dict:
        for pat, summary, action in self._RULES:
            if pat.search(job.error_message or ""):
                return {"error_summary": summary, "action_item": action}
        return {"error_summary": "Unclassified execution failure.",
                "action_item": "Inspect the job log snippet for the first exception."}

class GeminiDiagnostics(DiagnosticsEngine):
    def __init__(self, api_key: str, endpoint: str, timeout: float = 15.0):
        self.api_key, self.endpoint, self.timeout = api_key, endpoint, timeout

    async def diagnose(self, job: TaskStatus) -> dict:
        prompt = {"system": "You are an expert Talend System Administrator and Bosch Enterprise DevOps Engineer.",
                  "input": {"job_name": job.job_name, "environment": job.context,
                            "log_extract": (job.log_snippet or job.error_message)[-2048:]},
                  "output": "Strict JSON: {\"error_summary\": <=15 words, \"action_item\": precise step}."}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            r = await client.post(self.endpoint, headers={"Authorization": f"Bearer {self.api_key}"},
                                  json=prompt)
            r.raise_for_status()
        try:
            data = json.loads(_extract_json(r.text))        # tolerate markdown-fenced JSON
        except (ValueError, KeyError):
            data = {}
        if not all(k in data for k in ("error_summary", "action_item")):
            log.warning("Gemini response missing expected keys; falling back to rules")
            return await RuleBasedDiagnostics().diagnose(job)
        return data

def _extract_json(text: str) -> str:
    m = re.search(r"\{.*\}", text, re.S)
    return m.group(0) if m else "{}"

def pick(config: dict) -> DiagnosticsEngine:
    return (GeminiDiagnostics(config["GEMINI_API_KEY"], config["GEMINI_ENDPOINT"])
            if config.get("GEMINI_API_KEY") and config.get("GEMINI_ENDPOINT")
            else RuleBasedDiagnostics())
