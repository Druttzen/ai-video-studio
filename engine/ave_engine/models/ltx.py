"""LTX-Video adapter (text-to-video and image-to-video).

LTX is the default model: fast, fits comfortably on 8-12 GB GPUs, and supports
both tasks. We pick the right diffusers pipeline class per task and share the
memory policy + step callback wiring.
"""

from __future__ import annotations

from typing import Optional

import numpy as np

from ..device import torch_dtype
from ..schemas import GenerationRequest
from .base import ProgressCb, VideoModel


class LTXModel(VideoModel):
    spec_id = "ltx-video"

    def __init__(self, repo_id: str, policy=None) -> None:
        super().__init__(repo_id, policy)
        self._task = "text-to-video"

    def load(self) -> None:
        # Loaded lazily per task in generate(); see _ensure_pipe.
        pass

    def _ensure_pipe(self, task: str) -> None:
        if self.pipe is not None and self._task == task:
            return
        import torch  # noqa: F401
        from diffusers import LTXImageToVideoPipeline, LTXPipeline

        dtype = torch_dtype(self.policy.dtype)
        cls = LTXImageToVideoPipeline if task == "image-to-video" else LTXPipeline
        pipe = cls.from_pretrained(self.repo_id, torch_dtype=dtype)
        self._apply_memory_policy(pipe)
        self.pipe = pipe
        self._task = task

    def generate(
        self,
        req: GenerationRequest,
        progress: Optional[ProgressCb] = None,
    ) -> list[np.ndarray]:
        import torch

        self._ensure_pipe(req.task)
        total = req.num_inference_steps

        def _cb(pipe, step, timestep, kwargs):
            if progress:
                progress(step + 1, total)
            return kwargs

        generator = None
        if req.seed is not None:
            generator = torch.Generator(device="cpu").manual_seed(int(req.seed))

        kwargs = dict(
            prompt=req.prompt,
            negative_prompt=req.negative_prompt or None,
            width=req.width,
            height=req.height,
            num_frames=req.num_frames,
            num_inference_steps=req.num_inference_steps,
            guidance_scale=req.guidance_scale,
            generator=generator,
            callback_on_step_end=_cb,
        )

        if req.task == "image-to-video":
            from .image_utils import load_image
            kwargs["image"] = load_image(req)

        result = self.pipe(**kwargs)
        frames = result.frames[0]  # diffusers returns list-of-videos
        return self._frames_to_uint8(frames)
