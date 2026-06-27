"""First-run onboarding state stored beside models and outputs."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from .config import get_settings


def _path() -> Path:
    return get_settings().data_dir / "onboarding.json"


def get_state() -> dict:
    path = _path()
    if not path.exists():
        return {"complete": False}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    except (json.JSONDecodeError, OSError):
        pass
    return {"complete": False}


def mark_complete() -> dict:
    state = {
        "complete": True,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    path = _path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2), encoding="utf-8")
    return state
