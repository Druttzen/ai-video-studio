"""Persist finished render jobs so the Library survives engine restarts."""

from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import get_settings

_MAX_ENTRIES = 150
_LOCK = threading.Lock()


def _history_path() -> Path:
    return get_settings().cache_dir / "job-history.json"


def _trim_payload(payload: dict | None) -> dict | None:
    if not payload:
        return None
    keep = (
        "model_id",
        "task",
        "prompt",
        "brief",
        "width",
        "height",
        "target_seconds",
        "n_scenes",
    )
    return {k: payload[k] for k in keep if k in payload}


def _normalize(entry: dict) -> dict:
    out = dict(entry)
    out["request"] = _trim_payload(out.get("request"))
    if "saved_at" not in out:
        out["saved_at"] = datetime.now(timezone.utc).isoformat()
    return out


def load() -> list[dict]:
    path = _history_path()
    if not path.exists():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(raw, list):
            return [_normalize(e) for e in raw if isinstance(e, dict)]
    except (json.JSONDecodeError, OSError):
        pass
    return []


def save(entries: list[dict]) -> None:
    path = _history_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    trimmed = [_normalize(e) for e in entries[:_MAX_ENTRIES]]
    path.write_text(json.dumps(trimmed, indent=2), encoding="utf-8")


def append(status: dict) -> None:
    if status.get("status") not in ("done", "error", "cancelled"):
        return
    with _LOCK:
        entries = load()
        entries = [e for e in entries if e.get("job_id") != status.get("job_id")]
        entries.insert(0, _normalize(status))
        save(entries[:_MAX_ENTRIES])


def discover_from_outputs() -> list[dict]:
    """Index MP4 files in outputs/ that are not already in history."""
    outputs = get_settings().outputs_dir
    if not outputs.exists():
        return []

    known_paths = {e.get("output_path") for e in load()}
    discovered: list[dict] = []
    for mp4 in sorted(outputs.glob("*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True):
        path = str(mp4.resolve())
        if path in known_paths:
            continue
        if mp4.name.startswith("_") or "work" in mp4.stem:
            continue
        discovered.append(
            {
                "job_id": f"file-{mp4.stem[:16]}",
                "kind": "generate",
                "label": mp4.stem.replace("_", " "),
                "status": "done",
                "progress": 1.0,
                "step": 0,
                "total_steps": 0,
                "message": "imported from outputs folder",
                "output_path": path,
                "error": None,
                "request": None,
                "saved_at": datetime.fromtimestamp(
                    mp4.stat().st_mtime, tz=timezone.utc
                ).isoformat(),
            }
        )
    return discovered[:50]
