"""Adapter contract every video model must satisfy.

Keeping this tiny and uniform is what lets the engine, the job runner and the
UI stay model-agnostic. Adapters own loading and a single ``generate`` call
that yields a list of RGB frames (numpy uint8 HxWx3); the export step turns
frames into a file.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Callable, Optional

import numpy as np

from ..device import DevicePolicy, build_policy
from ..schemas import GenerationRequest


ProgressCb = Callable[[int, int], None]  # (step, total_steps)


class VideoModel(ABC):
    """Base class for all video model adapters."""

    spec_id: str

    def __init__(self, repo_id: str, policy: Optional[DevicePolicy] = None) -> None:
        self.repo_id = repo_id
        self.policy = policy or build_policy()
        self.pipe = None

    @abstractmethod
    def load(self) -> None:
        """Instantiate the underlying diffusers pipeline and apply the policy."""

    @abstractmethod
    def generate(
        self,
        req: "GenerationRequest",
        progress: Optional[ProgressCb] = None,
    ) -> list[np.ndarray]:
        """Run inference and return a list of RGB frames (uint8, HxWx3)."""

    def unload(self) -> None:
        self.pipe = None
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass

    # -- shared helpers --------------------------------------------------------
    def _apply_memory_policy(self, pipe) -> None:
        p = self.policy
        try:
            if p.enable_sequential_cpu_offload:
                pipe.enable_sequential_cpu_offload()
            elif p.enable_model_cpu_offload:
                pipe.enable_model_cpu_offload()
            else:
                pipe.to(p.device)
        except Exception:
            pipe.to(p.device)

        for attr, enabled in (
            ("enable_vae_slicing", p.enable_vae_slicing),
            ("enable_attention_slicing", p.attention_slicing),
            ("enable_vae_tiling", p.enable_vae_tiling),
        ):
            if enabled and hasattr(pipe, attr):
                try:
                    getattr(pipe, attr)()
                except Exception:
                    pass

    @staticmethod
    def _frames_to_uint8(frames) -> list[np.ndarray]:
        """Normalize diffusers output (PIL list or float arrays) to uint8 RGB."""
        out: list[np.ndarray] = []
        for f in frames:
            if isinstance(f, np.ndarray):
                arr = f
                if arr.dtype != np.uint8:
                    arr = np.clip(arr * 255.0 if arr.max() <= 1.0 else arr, 0, 255)
                    arr = arr.astype(np.uint8)
                out.append(arr)
            else:  # PIL.Image
                out.append(np.asarray(f.convert("RGB"), dtype=np.uint8))
        return out
