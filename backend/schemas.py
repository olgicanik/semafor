"""Pydantic models for the Traffic Light Job Monitoring backend.

Pure data contracts — no behaviour lives here. ``ServerWithJobs`` extends
``Server`` with the ``jobs`` array because ``GET /api/servers`` must return
servers with nested jobs while the spec's ``Server`` model stays as listed.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field


def utc_now() -> datetime:
    """Timezone-aware 'now' shared by every default factory."""
    return datetime.now(timezone.utc)


class Environment(str, Enum):
    """Deployment environment a server lives in."""

    DEV = "dev"
    QA = "qa"
    PROD = "prod"


class AuthType(str, Enum):
    """Supported authentication families. Key for the adapter registry."""

    API_KEY = "api_key"
    BASIC_AUTH = "basic_auth"
    SSH = "ssh"
    PROXY = "proxy"


class TrafficStatus(str, Enum):
    """Traffic-light semantics: green = running, yellow = stopped, red = error."""

    GREEN = "green"
    YELLOW = "yellow"
    RED = "red"


class AuthCredentials(BaseModel):
    """Credentials bag — only the fields matching ``auth_type`` are consumed.

    api_key    -> token
    basic_auth -> username + password
    ssh        -> ssh_private_key (path or inline key)
    proxy      -> proxy_url
    """

    token: str | None = None
    username: str | None = None
    password: str | None = None
    ssh_private_key: str | None = None
    proxy_url: str | None = None


class AuthConfig(BaseModel):
    """Complete auth configuration handed to the AuthManager adapter resolution."""

    auth_type: AuthType
    auth_credentials: AuthCredentials = Field(default_factory=AuthCredentials)


class HistoryEntry(BaseModel):
    """One recorded status transition (feeds future analytics)."""

    status: TrafficStatus
    timestamp: datetime = Field(default_factory=utc_now)
    error_count: int = 0  # number of red jobs on this server at transition time


class Job(BaseModel):
    id: str
    name: str
    status: TrafficStatus = TrafficStatus.GREEN
    last_run: datetime = Field(default_factory=utc_now)
    message: str = ""


class Server(BaseModel):
    """A monitored server — exactly the fields named in the spec."""

    id: str
    name: str
    environment: Environment
    auth_type: AuthType
    auth_credentials: AuthCredentials = Field(default_factory=AuthCredentials)
    is_pinned: bool = False
    history: list[HistoryEntry] = Field(default_factory=list)


class ServerWithJobs(Server):
    """API payload / on-disk record: a ``Server`` plus its nested ``jobs``."""

    jobs: list[Job] = Field(default_factory=list)


class EnvironmentUptime(BaseModel):
    environment: Environment
    average_uptime_percent: float


class AnalyticsResponse(BaseModel):
    """Payload for ``GET /api/analytics`` (mock stats with real formulas)."""

    average_uptime_per_environment: list[EnvironmentUptime]
    total_red_errors_last_24h: int
    failure_rate_percent: float  # red transitions / all transitions in the last 24 h
    most_unstable_server: str | None  # server id with the most red transitions (None if none)
    generated_at: datetime = Field(default_factory=utc_now)
