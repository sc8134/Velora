"""
In-memory job queue with retry support.
Each job tracks status, progress, retry count, and full history.
"""
import uuid
import time
from typing import Dict, Any, List

_jobs: Dict[str, Dict[str, Any]] = {}

MAX_RETRIES = 3


def create_job(url: str = "", params: dict | None = None) -> str:
    job_id = str(uuid.uuid4())
    _jobs[job_id] = {
        "id": job_id,
        "url": url,
        "params": params or {},
        "status": "pending",       # pending | running | done | error | retrying
        "progress": 0,
        "message": "",
        "filename": None,
        "filepath": None,
        "error": None,
        "retries": 0,
        "max_retries": MAX_RETRIES,
        "created_at": time.time(),
        "updated_at": time.time(),
        "history": [],             # list of {timestamp, status, message}
    }
    return job_id


def get_job(job_id: str) -> Dict[str, Any] | None:
    return _jobs.get(job_id)


def update_job(job_id: str, **kwargs):
    if job_id in _jobs:
        _jobs[job_id].update(kwargs)
        _jobs[job_id]["updated_at"] = time.time()


def append_history(job_id: str, status: str, message: str):
    if job_id in _jobs:
        _jobs[job_id]["history"].append({
            "timestamp": time.time(),
            "status": status,
            "message": message,
        })


def mark_retry(job_id: str, error: str) -> bool:
    """Increment retry counter. Returns True if retry is allowed."""
    job = _jobs.get(job_id)
    if not job:
        return False
    if job["retries"] >= job["max_retries"]:
        return False
    job["retries"] += 1
    job["status"] = "retrying"
    job["error"] = error
    job["updated_at"] = time.time()
    append_history(job_id, "retrying", f"Retry {job['retries']}/{job['max_retries']}: {error}")
    return True


def all_jobs() -> List[Dict[str, Any]]:
    return list(_jobs.values())


def retryable_jobs() -> List[Dict[str, Any]]:
    return [j for j in _jobs.values() if j["status"] == "retrying"]
