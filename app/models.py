# app/models.py
from dataclasses import dataclass
from typing import Optional
from datetime import datetime

@dataclass(frozen=True)
class TaskStatus:
    job_id: int
    project_name: str
    branch_name: str
    job_name: str
    job_label: str
    job_version: str
    context: str
    target_server: str
    server_category: str
    execution_status: str
    error_message: str
    last_run_time: Optional[datetime] = None   # None when live TAC omits it
    next_run_time: Optional[datetime] = None
    trigger_status: str = ""
    log_snippet: str = ""
    ai_recommendation: str = ""
