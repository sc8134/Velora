"""
Audit log + analytics.
Writes structured JSON lines to velora_audit.log.
Provides query helpers for the analytics dashboard.
"""
import os
import json
import time
from typing import List, Dict, Any

_LOG_FILE = os.path.join(os.path.dirname(__file__), "velora_audit.log")


# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------

def log_event(
    event: str,
    user: str = "anonymous",
    details: Dict[str, Any] | None = None,
):
    """Append one structured log line."""
    entry = {
        "ts": time.time(),
        "event": event,
        "user": user,
        "details": details or {},
    }
    with open(_LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

def _read_all() -> List[Dict[str, Any]]:
    if not os.path.exists(_LOG_FILE):
        return []
    entries = []
    with open(_LOG_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return entries


def recent_events(limit: int = 100) -> List[Dict[str, Any]]:
    return _read_all()[-limit:]


def analytics_summary() -> Dict[str, Any]:
    """Aggregate stats for the dashboard."""
    entries = _read_all()

    total = len(entries)
    by_event: Dict[str, int] = {}
    by_user: Dict[str, int] = {}
    errors = 0
    downloads = 0

    for e in entries:
        ev = e.get("event", "unknown")
        by_event[ev] = by_event.get(ev, 0) + 1
        u = e.get("user", "anonymous")
        by_user[u] = by_user.get(u, 0) + 1
        if ev in ("download_start", "job_enqueue"):
            downloads += 1
        if ev in ("download_error", "job_error"):
            errors += 1

    # Last 24 h activity (hourly buckets)
    now = time.time()
    hourly: Dict[int, int] = {h: 0 for h in range(24)}
    for e in entries:
        age_h = int((now - e.get("ts", now)) / 3600)
        if 0 <= age_h < 24:
            hourly[age_h] += 1

    return {
        "total_events": total,
        "total_downloads": downloads,
        "total_errors": errors,
        "by_event": by_event,
        "top_users": sorted(by_user.items(), key=lambda x: -x[1])[:10],
        "hourly_last_24h": [{"hours_ago": k, "count": v} for k, v in sorted(hourly.items())],
    }
