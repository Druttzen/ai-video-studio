"""Stable Video Diffusion adapter (image-to-video, NON-COMMERCIAL license)."""

from __future__ import annotations

from typing import Optional

import numpy as np

from ..device import torch_dtype
from ..schemas import GenerationRequest
from .base import ProgressCb, VideoModel
from .image_utils import load_image


class SVDModel(VideoModel):
    spec_id = "svd-xt"

    def load(self) -> None:
        import torch  # noqa: F401
        from diffusers import StableVideoDiffusionPipeline

        dtype = torch_dtype(self.policy.dtype)
        pipe = StableVideoDiffusionPipeline.from_pretrained(
            self.repo_id, torch_dtype=dtype, variant="fp16"
        )
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

        image = load_image(req)
        result = self.pipe(
            image=image,
            height=req.height,
            width=req.width,
            num_frames=req.num_frames,
            num_inference_steps=req.num_inference_steps,
            fps=req.fps,
            motion_bucket_id=int(req.extra.get("motion_bucket_id", 127)),
            generator=generator,
            callback_on_step_end=_cb,
        )
        frames = result.frames[0]
        return self._frames_to_uint8(frames)
