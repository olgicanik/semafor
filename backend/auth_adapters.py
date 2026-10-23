"""Modular authentication — adapter pattern keyed by ``auth_type``.

Every connector is a *mock*: it returns the headers / routing metadata a real
transport would need, but never opens a socket. A real integration (e.g. the
base64 basic-auth TAC call in the repo's tac_status.py) swaps in by wrapping
the same interface — routes never change.
"""
from __future__ import annotations

import base64
from abc import ABC, abstractmethod

from schemas import AuthCredentials


class AuthAdapterError(Exception):
    """Raised when no adapter is registered for an auth_type."""


class BaseAuthAdapter(ABC):
    """Interface every adapter implements."""

    #: Registry key; must match a value of ``schemas.AuthType``.
    auth_type: str

    def __init__(self, credentials: AuthCredentials) -> None:
        self.credentials = credentials

    @abstractmethod
    def get_headers(self) -> dict[str, str]:
        """Mock HTTP headers a real request would carry."""

    @abstractmethod
    def describe(self) -> str:
        """Short human-readable auth summary (badges / logs)."""


class ApiKeyAdapter(BaseAuthAdapter):
    auth_type = "api_key"

    def get_headers(self) -> dict[str, str]:
        return {"X-API-Key": self.credentials.token or "mock-token"}

    def describe(self) -> str:
        return "API key (mock)"


class BasicAuthAdapter(BaseAuthAdapter):
    auth_type = "basic_auth"

    def get_headers(self) -> dict[str, str]:
        user = self.credentials.username or "mock-user"
        password = self.credentials.password or ""
        encoded = base64.b64encode(f"{user}:{password}".encode("utf-8")).decode("ascii")
        return {"Authorization": f"Basic {encoded}"}

    def describe(self) -> str:
        return "Basic auth (mock)"


class SshAdapter(BaseAuthAdapter):
    auth_type = "ssh"

    def get_headers(self) -> dict[str, str]:
        return {"X-SSH-Private-Key": self.credentials.ssh_private_key or "mock-key-path"}

    def describe(self) -> str:
        return "SSH key (mock, no connection)"


class ProxyAdapter(BaseAuthAdapter):
    auth_type = "proxy"

    def get_headers(self) -> dict[str, str]:
        # "Routes through the proxy URL": the mock surfaces the target proxy so
        # a real adapter can send traffic via it.
        return {"X-Proxy-Route": self.credentials.proxy_url or "http://localhost:9000"}

    def describe(self) -> str:
        return f"Proxied via {self.credentials.proxy_url or 'mock-proxy'}"


class AuthManager:
    """Resolves an adapter for a server's ``auth_type`` (registry pattern)."""

    _registry: dict[str, type[BaseAuthAdapter]] = {}

    @classmethod
    def register(cls, adapter_cls: type[BaseAuthAdapter]) -> None:
        cls._registry[adapter_cls.auth_type] = adapter_cls

    @classmethod
    def get_adapter(cls, auth_config) -> BaseAuthAdapter:
        """Return a configured adapter or raise ``AuthAdapterError``."""
        key = auth_config.auth_type.value  # str hash — no enum-hash ambiguity
        adapter_cls = cls._registry.get(key)
        if adapter_cls is None:
            raise AuthAdapterError(f"No adapter registered for auth_type={key!r}")
        return adapter_cls(auth_config.auth_credentials)


# Auto-register every concrete adapter on import. Adding a new adapter class in
# this module is all that is needed to extend supported auth types.
for _adapter_cls in BaseAuthAdapter.__subclasses__():
    AuthManager.register(_adapter_cls)
