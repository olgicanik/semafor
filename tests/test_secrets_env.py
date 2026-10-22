# tests/test_secrets_env.py
import os
from pathlib import Path

import pytest
from cryptography.exceptions import InvalidTag

from app import secrets_env
from app.secrets_env import _derive_key, decrypt_value, encrypt_value, load_all, load_env_file


def test_round_trip():
    key = _derive_key("12345")
    token = encrypt_value("s3cr3t value", key)
    assert decrypt_value(token, key) == "s3cr3t value"
    assert token != "s3cr3t value"


def test_wrong_master_raises_invalidtag():
    token = encrypt_value("secret", _derive_key("right"))
    with pytest.raises(InvalidTag):
        decrypt_value(token, _derive_key("wrong"))


def test_load_env_file_decrypts_in_place(tmp_path):
    p = tmp_path / ".env"
    p.write_text(
        f"TAC_PASSWORD_1_ENCRYPTED={encrypt_value('pw-1', _derive_key('12345'))}\n"
        "TAC_URL_1=https://tac1.example\n",
        encoding="utf-8",
    )
    env = load_env_file(str(p))
    assert env["TAC_PASSWORD_1_ENCRYPTED"] == "pw-1"
    assert env["TAC_URL_1"] == "https://tac1.example"


def test_load_all_env_var_overrides_env_file(tmp_path, monkeypatch):
    p = tmp_path / ".env"
    p.write_text("GEMINI_API_KEY=from_file\n", encoding="utf-8")
    monkeypatch.setenv("GEMINI_API_KEY", "from_env")
    env = load_all()
    assert env["GEMINI_API_KEY"] == "from_env"


def _write_env(p: Path, master_line_after_secret: bool) -> None:
    secret = encrypt_value("pw-x", _derive_key("file_master"))
    if master_line_after_secret:
        content = f"TAC_PASSWORD_1_ENCRYPTED={secret}\nSEMAFOR_MASTER_PASSWORD=file_master\n"
    else:
        content = f"SEMAFOR_MASTER_PASSWORD=file_master\nTAC_PASSWORD_1_ENCRYPTED={secret}\n"
    p.write_text(content, encoding="utf-8")


@pytest.mark.parametrize("master_line_after_secret", [False, True])
def test_env_file_master_password_honored(tmp_path, monkeypatch, master_line_after_secret):
    monkeypatch.delenv("SEMAFOR_MASTER_PASSWORD", raising=False)
    p = tmp_path / ".env"
    _write_env(p, master_line_after_secret)
    env = load_env_file(str(p))
    assert env["TAC_PASSWORD_1_ENCRYPTED"] == "pw-x"


def test_process_env_master_overrides_file(tmp_path, monkeypatch):
    monkeypatch.setenv("SEMAFOR_MASTER_PASSWORD", "env_master")
    secret = encrypt_value("pw-y", _derive_key("env_master"))
    p = tmp_path / ".env"
    p.write_text(
        f"SEMAFOR_MASTER_PASSWORD=file_master\nTAC_PASSWORD_1_ENCRYPTED={secret}\n",
        encoding="utf-8",
    )
    env = load_env_file(str(p))
    assert env["TAC_PASSWORD_1_ENCRYPTED"] == "pw-y"


def test_missing_password_fails_fast(tmp_path, monkeypatch):
    monkeypatch.setenv("TAC_URL_1", "https://tac1.example")
    monkeypatch.delenv("TAC_PASSWORD_1_ENCRYPTED", raising=False)
    monkeypatch.delenv("TAC_USERNAME", raising=False)
    monkeypatch.delenv("SIM_SERVERS", raising=False)
    from app.config import build_settings
    with pytest.raises(RuntimeError, match="TAC_URL_1 set but TAC_PASSWORD_1_ENCRYPTED missing"):
        build_settings()


@pytest.mark.parametrize("key", ["TAC_PASSWORD_1_ENCRYPTED", "TAC_PASSWORD_2_ENCRYPTED",
                                 "TAC_PASSWORD_3_ENCRYPTED", "TAC_PASSWORD_4_ENCRYPTED",
                                 "TAC_PASSWORD_5_ENCRYPTED"])
def test_env_example_has_blank_encrypted_values(key):
    example = Path(__file__).resolve().parents[1] / ".env.example"
    text = example.read_text(encoding="utf-8")
    line = next(ln for ln in text.splitlines() if ln.startswith(key + "="))
    assert line.split("=", 1)[1] == ""
