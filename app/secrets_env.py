# app/secrets_env.py
import os, base64, hashlib, hmac, secrets
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend

MASTER_PASSWORD = os.environ.get("SEMAFOR_MASTER_PASSWORD", "12345")  # prototype default
_SALT = b"semafor-prototype-salt-v1"   # fixed salt: documented prototype choice

def _derive_key(master_password: str) -> bytes:
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=_SALT,
                     iterations=120_000, backend=default_backend())
    return kdf.derive(master_password.encode("utf-8"))

def encrypt_value(plaintext: str, key: bytes) -> str:
    """-> base64(nonce || ciphertext || tag). Exposed for scripts/encrypt_env.py."""
    nonce = secrets.token_bytes(12)
    ct = AESGCM(key).encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.b64encode(nonce + ct).decode("ascii")

def decrypt_value(token: str, key: bytes) -> str:
    raw = base64.b64decode(token)
    nonce, ct = raw[:12], raw[12:]
    return AESGCM(key).decrypt(nonce, ct, None).decode("utf-8")

def _parse_line(line: str) -> "tuple[str, str] | None":
    """-> (key, value) for a non-comment KEY=VALUE line, else None."""
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        return None
    key, _, value = line.partition("=")
    return key.strip(), value.strip().strip('"').strip("'")

def load_env_file(path: str = ".env") -> dict:
    """Parse plain KEY=VALUE lines; values marked *_ENCRYPTED are decrypted in place.

    Master password resolution (in precedence order): the SEMAFOR_MASTER_PASSWORD
    environment variable, else a `SEMAFOR_MASTER_PASSWORD` line in this same
    .env file, else the module default. The .env line IS honored (users' stated
    contract 'all credentials from .env'), while the env var keeps offering a
    shell-side rotation path that does not touch the encrypted file. Because the
    master line can legally appear after the first *_ENCRYPTED line, the file is
    parsed in two passes: keys are collected first, then decryption runs with the
    resolved master password.
    """
    values: dict = {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            lines = list(f)
    except FileNotFoundError:
        return values
    for line in lines:                                # pass 1: plaintext keys
        parsed = _parse_line(line)
        if parsed is None:
            continue
        key, value = parsed
        if not key.endswith("_ENCRYPTED"):
            values[key] = value
    master = (os.environ.get("SEMAFOR_MASTER_PASSWORD")
              or values.get("SEMAFOR_MASTER_PASSWORD")
              or MASTER_PASSWORD)
    key_for = _derive_key(master)
    for line in lines:                                # pass 2: decrypt secrets
        parsed = _parse_line(line)
        if parsed is None:
            continue
        key, value = parsed
        if key.endswith("_ENCRYPTED") and value:
            values[key] = decrypt_value(value, key_for)
    return values

def load_all() -> dict:
    """Merge: real os.environ wins over .env values (env vars override .env).

    Env-override is the documented contract — it is also how an operator rotates
    the master password (SEMAFOR_MASTER_PASSWORD) or injects GEMINI_API_KEY
    without touching .env. A real process env var must therefore *overwrite* the
    .env value.
    """
    env = load_env_file()
    for k, v in dict(os.environ).items():
        env[k] = v
    return env
