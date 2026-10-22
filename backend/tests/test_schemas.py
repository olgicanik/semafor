"""Schema-level tests: defaults, coercion, enum validation."""
import pytest
from pydantic import ValidationError

from schemas import (
    AuthConfig,
    Environment,
    Job,
    AuthType,
    TrafficStatus,
    Server,
    ServerWithJobs,
)


def test_server_defaults():
    server = Server.model_validate(
        {"id": "srv-1", "name": "A", "environment": "dev", "auth_type": "api_key"}
    )
    assert server.is_pinned is False
    assert server.history == []
    assert server.auth_credentials.token is None


def test_server_rejects_unknown_environment_and_auth():
    with pytest.raises(ValidationError):
        Server.model_validate(
            {"id": "srv-1", "name": "A", "environment": "stage", "auth_type": "api_key"}
        )
    with pytest.raises(ValidationError):
        Server.model_validate(
            {"id": "srv-1", "name": "A", "environment": "dev", "auth_type": "oauth"}
        )


def test_job_status_enum_is_bounded():
    job = Job.model_validate(
        {"id": "j-1", "name": "ETL", "status": "red"}
    )
    assert job.status == TrafficStatus.RED


def test_auth_config_roundtrips_discriminated_fields():
    cfg = AuthConfig.model_validate(
        {"auth_type": "proxy", "auth_credentials": {"proxy_url": "http://proxy:8080"}}
    )
    assert cfg.auth_type == AuthType.PROXY
    assert cfg.auth_credentials.proxy_url == "http://proxy:8080"


def test_server_with_jobs_nests_jobs():
    payload = ServerWithJobs.model_validate(
        {
            "id": "srv-1",
            "name": "A",
            "environment": "qa",
            "auth_type": "ssh",
            "jobs": [{"id": "j-1", "name": "ETL", "status": "green"}],
        }
    )
    assert len(payload.jobs) == 1
    for value in (Environment.QA, AuthType.SSH):
        assert isinstance(value.name, str)  # enum members link back to names
