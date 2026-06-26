"""Model download / cache management on top of the Hugging Face Hub.

Downloads run in a background thread and report coarse progress so the UI's
Model Manager can show a live status. We deliberately keep weights in our own
``models_dir`` (set via ``HF_HOME``) so listing, sizing and deleting are simple.
"""

from __future__ import annotations

import shutil
import threading
from dataclasses import dataclass, field

from ..config import get_settings
from . import registry


@dataclass
class DownloadState:
    model_id: str
    status: str = "idle"          # idle | downloading | ready | error
    progress: float = 0.0         # 0..1 (best-effort)
    message: str = ""
    error: str | None = None
    _thread: threading.Thread | None = field(default=None, repr=False)


class ModelManager:
    def __init__(self) -> None:
        self._states: dict[str, DownloadState] = {}
        self._lock = threading.Lock()

    # ---- local cache helpers -------------------------------------------------
    def _repo_cache_dir(self, repo_id: str):
        folder = "models--" + repo_id.replace("/", "--")
        base = get_settings().models_dir
        # huggingface_hub may nest under hub/ depending on cache layout.
        for candidate in (base / folder, base / "hub" / folder):
            if candidate.exists():
                return candidate
        return base / folder

    def is_downloaded(self, model_id: str) -> bool:
        spec = registry.get_spec(model_id)
        d = self._repo_cache_dir(spec.repo_id)
        return d.exists() and any(d.rglob("*.safetensors")) or (
            d.exists() and any(d.rglob("*.bin"))
        )

    def disk_size_gb(self, model_id: str) -> float:
        spec = registry.get_spec(model_id)
        d = self._repo_cache_dir(spec.repo_id)
        if not d.exists():
            return 0.0
        total = sum(p.stat().st_size for p in d.rglob("*") if p.is_file())
        return round(total / (1024 ** 3), 2)

    # ---- status --------------------------------------------------------------
    def status(self, model_id: str) -> dict:
        spec = registry.get_spec(model_id)
        with self._lock:
            st = self._states.get(model_id)
        downloaded = self.is_downloaded(model_id)
        status = "ready" if downloaded else "idle"
        progress = 1.0 if downloaded else 0.0
        message = ""
        error = None
        if st is not None and st.status == "downloading":
            status, progress, message = "downloading", st.progress, st.message
        elif st is not None and st.status == "error":
            status, error = "error", st.error
        return {
            **spec.as_dict(),
            "downloaded": downloaded,
            "disk_size_gb": self.disk_size_gb(model_id),
            "status": status,
            "progress": progress,
            "message": message,
            "error": error,
        }

    def status_all(self) -> list[dict]:
        return [self.status(m.id) for m in registry.all_models()]

    # ---- download / delete ---------------------------------------------------
    def start_download(self, model_id: str) -> dict:
        spec = registry.get_spec(model_id)
        with self._lock:
            existing = self._states.get(model_id)
            if existing and existing.status == "downloading":
                return self.status(model_id)
            state = DownloadState(model_id=model_id, status="downloading", message="starting")
            self._states[model_id] = state

        def _run() -> None:
            try:
                from huggingface_hub import snapshot_download

                state.message = "downloading weights"
                # Only fetch diffusers pipeline components (~28 GB), not every
                # variant checkpoint in the monorepo (which can exceed 100 GB).
                patterns = [
                    "model_index.json",
                    "scheduler/*",
                    "text_encoder/*",
                    "tokenizer/*",
                    "transformer/*",
                    "vae/*",
                ]
                snapshot_download(
                    repo_id=spec.repo_id,
                    cache_dir=str(get_settings().models_dir),
                    allow_patterns=patterns,
                    max_workers=4,
                )
                state.progress = 1.0
                state.status = "ready"
                state.message = "done"
            except Exception as exc:  # noqa: BLE001 - surface to UI
                state.status = "error"
                state.error = str(exc)

        t = threading.Thread(target=_run, name=f"dl-{model_id}", daemon=True)
        state._thread = t
        t.start()
        return self.status(model_id)

    def delete(self, model_id: str) -> dict:
        spec = registry.get_spec(model_id)
        d = self._repo_cache_dir(spec.repo_id)
        if d.exists():
            shutil.rmtree(d, ignore_errors=True)
        with self._lock:
            self._states.pop(model_id, None)
        return self.status(model_id)


_manager: ModelManager | None = None


def get_manager() -> ModelManager:
    global _manager
    if _manager is None:
        _manager = ModelManager()
    return _manager
