"""Single-clip generation (text-to-video / image-to-video)."""

from __future__ import annotations

from pathlib import Path

from ..pipeline.export import export_mp4
from ..schemas import GenerationRequest
from .runner import JobContext, register


def generate_clip(req: GenerationRequest, ctx: JobContext, lo: float = 0.05, hi: float = 0.9) -> list:
    """Shared helper: load model + sample frames with progress in [lo, hi]."""
    from ..models.factory import get_model

    ctx.progress(lo, f"loading {req.model_id}")
    model = get_model(req.model_id)
    cb = ctx.sampling_cb(lo, hi, "sampling")
    return model.generate(req, progress=cb)


@register("generate")
def run_generate(payload: dict, ctx: JobContext) -> str:
    req = GenerationRequest(**payload)
    frames = generate_clip(req, ctx, lo=0.05, hi=0.92)

    ctx.progress(0.93, "encoding video")
    out = Path(ctx.settings.outputs_dir) / f"{ctx.job.job_id}.mp4"
    export_mp4(frames, out, fps=req.fps)
    ctx.progress(1.0, "complete")
    return str(out)
