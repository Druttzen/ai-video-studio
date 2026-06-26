"""Persist base64 / data-URL uploads from the UI to the data dir.

Music-video and canvas jobs need their inputs (audio, images, faces) as real
files on disk for librosa/ffmpeg, so we decode UI uploads once here and pass
paths through the pipeline payloads.
"""

from __future__ import annotations

import base64
import uuid
from pathlib import Path

from .config import get_settings

_MIME_EXT = {
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/ogg": ".ogg",
    "audio/flac": ".flac",
    "audio/mp4": ".m4a",
    "audio/aac": ".aac",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
}


def _uploads_dir() -> Path:
    d = get_settings().data_dir / "uploads"
    d.mkdir(parents=True, exist_ok=True)
    return d


def save_data_url(data: str, default_ext: str = ".bin") -> str:
    """Decode a data URL or bare base64 string to a file; return its path."""
    mime = None
    payload = data
    if data.strip().startswith("data:"):
        header, payload = data.split(",", 1)
        mime = header[5:].split(";", 1)[0] or None
    ext = _MIME_EXT.get(mime or "", default_ext)
    path = _uploads_dir() / f"{uuid.uuid4().hex}{ext}"
    path.write_bytes(base64.b64decode(payload))
    return str(path)
