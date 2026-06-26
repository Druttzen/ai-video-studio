"""Runtime configuration and on-disk locations.

All heavy artifacts (model weights, generated videos) live under a single data
directory so the app is easy to back up or wipe. The Rust side passes
``AVE_DATA_DIR`` when it spawns the sidecar; otherwise we fall back to a
sensible per-user location.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path


def _default_data_dir() -> Path:
    # Prefer the platform's per-user app data location, fall back to ~.
    if os.name == "nt":
        base = os.environ.get("LOCALAPPDATA") or str(Path.home())
        return Path(base) / "AIVideoStudio"
    xdg = os.environ.get("XDG_DATA_HOME")
    if xdg:
        return Path(xdg) / "ai-video-studio"
    return Path.home() / ".ai-video-studio"


class Settings:
    """Process-wide settings resolved once at import time."""

    def __init__(self) -> None:
        self.data_dir = Path(os.environ.get("AVE_DATA_DIR") or _default_data_dir())
        self.models_dir = self.data_dir / "models"
        self.outputs_dir = self.data_dir / "outputs"
        self.cache_dir = self.data_dir / "cache"

        for d in (self.models_dir, self.outputs_dir, self.cache_dir):
            d.mkdir(parents=True, exist_ok=True)

        # Route the Hugging Face cache into our data dir so downloads are
        # discoverable, manageable, and removable from the UI.
        os.environ.setdefault("HF_HOME", str(self.models_dir))
        os.environ.setdefault("HF_HUB_ENABLE_HF_TRANSFER", "0")

        self.host = os.environ.get("AVE_HOST", "127.0.0.1")
        self.port = int(os.environ.get("AVE_PORT", "0"))  # 0 => OS picks a free port

    def to_dict(self) -> dict:
        return {
            "data_dir": str(self.data_dir),
            "models_dir": str(self.models_dir),
            "outputs_dir": str(self.outputs_dir),
            "host": self.host,
            "port": self.port,
        }


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
