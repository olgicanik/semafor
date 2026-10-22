# app/sources/base.py
from abc import ABC, abstractmethod

class Source(ABC):
    """Ingestion source boundary: returns {server_name: [TaskStatus, ...]}.

    The worker only talks to this interface, so the TAC adapter and the offline
    simulator are interchangeable without touching the store/API/UI (extensibility
    pillar of the v1 spec). An empty list for a server means 'unreachable' and is
    rendered UNKNOWN by build_snapshot.
    """
    @abstractmethod
    async def fetch(self) -> dict:
        ...

    async def close(self) -> None:   # optional cleanup hook; base is a no-op
        return None
