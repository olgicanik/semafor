# tests/test_diagnostics.py
import json

import httpx
import pytest

from app.diagnostics import (GeminiDiagnostics, RuleBasedDiagnostics,
                             _extract_json, pick)
from app.models import TaskStatus


def _job(err="", log_snippet=""):
    return TaskStatus(job_id=1, project_name="P", branch_name="main", job_name="job_x",
                      job_label="L", job_version="1.0", context="QA", target_server="S",
                      server_category="QA", execution_status="Job ended with error(s)",
                      error_message=err, log_snippet=log_snippet)


async def test_fallback_maps_error_classes():
    eng = RuleBasedDiagnostics()
    cases = {
        # Oracle network adapter
        "java.sql.SQLRecoverableException: IO Error: The Network Adapter could not establish the connection":
            "Oracle DB connection failed due to network unreachable status.",
        # timeout trigger
        "timeout trigger after 600000 ms": "Job hit scheduler timeout threshold.",
        # killed by user
        "Job killed by user": "Job was stopped by a user.",
        # unclassified
        "some unrelated failure": "Unclassified execution failure.",
    }
    for err, summary in cases.items():
        got = await eng.diagnose(_job(err))
        assert got["error_summary"] == summary
        assert got["action_item"]


def test_pick_fallback_when_env_empty():
    assert isinstance(pick({"GEMINI_API_KEY": "", "GEMINI_ENDPOINT": ""}),
                      RuleBasedDiagnostics)
    assert isinstance(pick({"GEMINI_API_KEY": "k", "GEMINI_ENDPOINT": ""}),
                      RuleBasedDiagnostics)
    assert isinstance(pick({"GEMINI_API_KEY": "k", "GEMINI_ENDPOINT": "https://x"}),
                      GeminiDiagnostics)


def test_extract_json_tolerates_fencing():
    text = 'Sure, here it is:\n```json\n{"error_summary": "a", "action_item": "b"}\n```\n'
    assert json.loads(_extract_json(text)) == {"error_summary": "a", "action_item": "b"}
    assert _extract_json("no json here") == "{}"


def _fake_async_client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_gemini_prompt_shape_and_parsing(monkeypatch):
    captured = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        captured["auth"] = request.headers.get("authorization")
        captured["body"] = json.loads(request.content)
        captured["url"] = str(request.url)
        return httpx.Response(200, text='```json\n{"error_summary": "DB down", "action_item": "Restart DB"}\n```')

    fake = _fake_async_client(handler)
    monkeypatch.setattr("app.diagnostics.httpx.AsyncClient", lambda **kw: fake)
    eng = GeminiDiagnostics("test-key", "https://genai/generate", timeout=5)
    got = await eng.diagnose(_job("boom", log_snippet="tail log line"))
    assert got == {"error_summary": "DB down", "action_item": "Restart DB"}
    assert captured["auth"] == "Bearer test-key"
    assert captured["url"] == "https://genai/generate"
    assert captured["body"]["input"]["job_name"] == "job_x"
    assert captured["body"]["input"]["log_extract"] == "tail log line"


async def test_gemini_missing_action_item_falls_back(monkeypatch):
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text='{"error_summary": "only"}')

    fake = _fake_async_client(handler)
    monkeypatch.setattr("app.diagnostics.httpx.AsyncClient", lambda **kw: fake)
    eng = GeminiDiagnostics("test-key", "https://genai/generate", timeout=5)
    got = await eng.diagnose(_job("boom"))
    assert got == {"error_summary": "Unclassified execution failure.",
                   "action_item": "Inspect the job log snippet for the first exception."}
