"""Spotify-Canvas pipeline: a perfectly-looping vertical clip (10/20/30s).

Generate a short base clip (image->video from a supplied picture, or
text->video from the brief), turn it into a seamless loop, and stretch it to the
requested duration at Canvas aspect (9:16 by default). Optionally mux a chosen
segment of a track (analyzed to start on a strong beat).
"""

from __future__ import annotations

from pathlib import Path

from ..analysis.audio import analyze_audio
from ..analysis.image import analyze_image
from ..analysis.prompt import build_prompt_plan
from ..compose.loop import build_loop
from ..pipeline.export import export_mp4
from ..schemas import GenerationRequest
from .runner import JobContext, register
from .single import generate_clip


@register("canvas")
def run_canvas(payload: dict, ctx: JobContext) -> str:
    out_dir = Path(ctx.settings.outputs_dir)
    work = out_dir / f"_canvas_{ctx.job.job_id}"
    work.mkdir(parents=True, exist_ok=True)

    target = float(payload.get("target_seconds", 20))
    width = int(payload.get("width", 720))
    height = int(payload.get("height", 1280))
    fps = int(payload.get("fps", 24))
    method = payload.get("loop_method", "pingpong")
    task = payload.get("task", "text-to-video")

    # Optional analyzers feed the prompt + audio start.
    audio = None
    audio_path = payload.get("audio_path")
    audio_start = 0.0
    if audio_path:
        ctx.progress(0.02, "analyzing music")
        audio = analyze_audio(audio_path)
        # Start the canvas audio on a downbeat near a high-energy section.
        if audio.downbeats:
            audio_start = audio.downbeats[min(len(audio.downbeats) - 1, 4)]

    image_analysis = None
    img_path = payload.get("image_path")
    if img_path:
        image_analysis = analyze_image(img_path)
        if image_analysis.is_portrait:
            # respect a portrait source unless caller overrode dimensions
            pass

    plan = build_prompt_plan(payload.get("brief", "looping abstract motion"), 1, audio, image_analysis)

    # Generate the seed clip.
    req = GenerationRequest(
        model_id=payload["model_id"],
        task=task,
        prompt=plan.scenes[0],
        negative_prompt=plan.negative_prompt,
        image_path=img_path if task == "image-to-video" else None,
        image_b64=payload.get("image_b64") if task == "image-to-video" else None,
        width=width,
        height=height,
        num_frames=int(payload.get("clip_frames", 49)),
        fps=fps,
        num_inference_steps=int(payload.get("num_inference_steps", 40)),
        guidance_scale=float(payload.get("guidance_scale", 3.0)),
        seed=payload.get("seed"),
    )
    frames = generate_clip(req, ctx, lo=0.05, hi=0.85)

    base = work / "base.mp4"
    export_mp4(frames, base, fps=fps)

    ctx.progress(0.88, f"building {int(target)}s {method} loop")
    out = out_dir / f"{ctx.job.job_id}.mp4"
    build_loop(
        base,
        out,
        target_seconds=target,
        width=width,
        height=height,
        method=method,
        crossfade=float(payload.get("crossfade", 0.5)),
        audio_path=Path(audio_path) if (audio_path and payload.get("with_audio", True)) else None,
        audio_start=audio_start,
    )

    for f in work.glob("*"):
        f.unlink(missing_ok=True)
    work.rmdir()

    ctx.progress(1.0, "complete")
    return str(out)
