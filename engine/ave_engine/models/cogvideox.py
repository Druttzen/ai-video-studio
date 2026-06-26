"""CogVideoX adapter (text-to-video, Apache-2.0 weights)."""

from __future__ import annotations

from typing import Optional

import numpy as np

from ..device import torch_dtype
from ..schemas import GenerationRequest
from .base import ProgressCb, VideoModel


class CogVideoXModel(VideoModel):
    spec_id = "cogvideox-2b"

    def load(self) -> None:
        import torch  # noqa: F401
        from diffusers import CogVideoXPipeline

        dtype = torch_dtype(self.policy.dtype)
        pipe = CogVideoXPipeline.from_pretrained(self.repo_id, torch_dtype=dtype)
        self._apply_memory_policy(pipe)
        self.pipe = pipe

    def generate(
        self,
        req: GenerationRequest,
        progress: Optional[ProgressCb] = None,
    ) -> list[np.ndarray]:
        import torch

        if self.pipe is None:
            self.load()
        total = req.num_inference_steps

        def _cb(pipe, step, timestep, kwargs):
            if progress:
                progress(step + 1, total)
            return kwargs

        generator = None
        if req.seed is not None:
            generator = torch.Generator(device="cpu").manual_seed(int(req.seed))

        result = self.pipe(
            prompt=req.prompt,
            negative_prompt=req.negative_prompt or None,
            num_frames=req.num_frames,
            num_inference_steps=req.num_inference_steps,
            guidance_scale=req.guidance_scale,
            generator=generator,
            callback_on_step_end=_cb,
        )
        frames = result.frames[0]
        return self._frames_to_uint8(frames)
