# app/cache.py
import json, copy, os
from typing import Optional

class StaticCache:
    """Single-writer snapshot cache. Worker process calls publish() (writes the
    file); API process holds the in-memory copy via load()/snapshot."""
    def __init__(self, path: str = "status.json"):
        self.path = path
        self._snapshot: Optional[dict] = None

    @property
    def snapshot(self) -> Optional[dict]:
        return copy.deepcopy(self._snapshot)      # freeze for readers

    def publish(self, snapshot: dict) -> None:
        self._snapshot = snapshot
        tmp = f"{self.path}.tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(snapshot, f, default=str, indent=2)
        os.replace(tmp, self.path)                 # atomic; replaces on POSIX + Windows

    def load(self) -> None:
        try:
            with open(self.path, "r", encoding="utf-8") as f:
                self._snapshot = json.load(f)
        except FileNotFoundError:
            self._snapshot = None
