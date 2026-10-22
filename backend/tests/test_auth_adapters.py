"""Auth manager + adapter behaviour (all mock, no network)."""
import pytest

from auth_adapters import (
    ApiKeyAdapter,
    AuthAdapterError,
    AuthManager,
    BaseAuthAdapter,
    BasicAuthAdapter,
    ProxyAdapter,
    SshAdapter,
)
from schemas import AuthConfig


@pytest.mark.parametrize(
    "auth_type, field, value",
    [
        ("api_key", "token", "tok-1"),
        ("basic_auth", "username", "u"),
        ("ssh", "ssh_private_key", "/keys/id"),
        ("proxy", "proxy_url", "http://proxy:8080"),
    ],
)
def test_each_adapter_returns_mock_headers(auth_type, field, value):
    cfg = AuthConfig.model_validate(
        {"auth_type": auth_type, "auth_credentials": {field: value}}
    )
    adapter = AuthManager.get_adapter(cfg)
    assert isinstance(adapter, BaseAuthAdapter)
    headers = adapter.get_headers()
    assert isinstance(headers, dict) and headers  # non-empty mock headers


def test_basic_auth_is_base64_basic():
    adapter = BasicAuthAdapter.__new__(BasicAuthAdapter)
    adapter.credentials = AuthConfig.model_validate(
        {"auth_type": "basic_auth", "auth_credentials": {"username": "alice", "password": "s3cret"}}
    ).auth_credentials
    header = adapter.get_headers()["Authorization"]
    assert header.startswith("Basic ")
    assert "YWxpY2U6czNjcmV0" in header  # base64("alice:s3cret")


def test_proxy_adapter_surfaces_proxy_url():
    adapter = AuthManager.get_adapter(
        AuthConfig.model_validate(
            {"auth_type": "proxy", "auth_credentials": {"proxy_url": "http://proxy-qa:8080"}}
        )
    )
    assert adapter.get_headers()["X-Proxy-Route"] == "http://proxy-qa:8080"


def test_unknown_auth_type_raises():
    cfg = AuthConfig.model_validate({"auth_type": "api_key"})
    AuthManager._registry.pop("api_key")
    try:
        with pytest.raises(AuthAdapterError):
            AuthManager.get_adapter(cfg)
    finally:
        AuthManager.register(ApiKeyAdapter)  # restore for other tests


def test_all_four_types_are_registered():
    assert set(AuthManager._registry) == {"api_key", "basic_auth", "ssh", "proxy"}
    assert AuthManager._registry["basic_auth"] is BasicAuthAdapter
    assert AuthManager._registry["ssh"] is SshAdapter
    assert AuthManager._registry["proxy"] is ProxyAdapter
