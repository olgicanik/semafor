# tests/conftest.py
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import pytest

@pytest.fixture
async def db(tmp_path):
    """Isolated SQLite connection per test (temp dir; pytest cleans it up)."""
    from app.store import open_db
    conn = await open_db(str(tmp_path / "test.db"))
    yield conn
    await conn.close()
