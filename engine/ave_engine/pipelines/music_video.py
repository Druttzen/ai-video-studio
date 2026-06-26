"""Music-video pipeline: analyze music + brief -> generate scenes -> beat-sync.

Steps
-----
1. Analyze the uploaded track (tempo, beats, duration, sections).
2. Turn the text brief (+ image/audio analysis) into N scene prompts.
3. Generate one short clip per scene (text->video, or image->video from an
   uploaded picture).
4. Cut the clips on beats and stretch the timeline to the full track length
   (beat sync + length sync), then mux the original audio.
5. Optional lip-sync stage if a face image/video + vocals are provided.
"""

from __future__ import annotations

from pathlib import Path

from ..analysis.audio import analyze_audio
from ..analysis.image import analyze_image
from ..analysis.prompt import build_prompt_plan
from ..compose.assemble import assemble_music_video
from ..pipeline.export import export_mp4
from ..schemas import GenerationRequest
from .runner import JobContext, register
from .single import generate_clip


@register("music-video")
def run_music_video(payload: dict, ctx: JobContext) -> str:
    out_dir = Path(ctx.settings.outputs_dir)
    work = out_dir / f"_mv_{ctx.job.job_id}"
    work.mkdir(parents=True, exist_ok=True)

    audio_path = Path(payload["audio_path"])
    width = int(payload.get("width", 768))
    height = int(payload.get("height", 512))
    fps = int(payload.get("fps", 24))
    n_scenes = int(payload.get("n_scenes", 4))
    beats_per_cut = int(payload.get("beats_per_cut", 4))
    length_sync = bool(payload.get("length_sync", True))
    task = payload.get("task", "text-to-video")

    # 1. analyze music
    ctx.progress(0.01, "analyzing music")
    audio = analyze_audio(str(audio_path), beats_per_bar=payload.get("beats_per_bar", 4))
    ctx.job.message = f"tempo {audio.tempo:.0f} BPM, {len(audio.beats)} beats"

    # 2. analyze image (optional) + build prompts
    image_analysis = None
    img_path = payload.get("image_path")
    if img_path:
        image_analysis = analyze_image(img_path)
    plan = build_prompt_plan(payload.get("brief", ""), n_scenes, audio, image_analysis)

    # 3. generate one clip per scene
    scene_clips: list[Path] = []
    gen_lo, gen_hi = 0.05, 0.75
    span = (gen_hi - gen_lo) / max(1, len(plan.scenes))
    for i, scene_prompt in enumerate(plan.scenes):
        s_lo = gen_lo + i * span
        s_hi = s_lo + span
        req = GenerationRequest(
            model_id=payload["model_id"],
            task=task,
            prompt=scene_prompt,
            negative_prompt=plan.negative_prompt,
            image_path=img_path if task == "image-to-video" else None,
            image_b64=payload.get("image_b64") if task == "image-to-video" else None,
            width=width,
            height=height,
            num_frames=int(payload.get("clip_frames", 49)),
            fps=fps,
            num_inference_steps=int(payload.get("num_inference_steps", 40)),
            guidance_scale=float(payload.get("guidance_scale", 3.0)),
            seed=(payload.get("seed") + i) if payload.get("seed") is not None else None,
        )
        ctx.job.message = f"scene {i + 1}/{len(plan.scenes)}: {scene_prompt[:40]}"
        frames = generate_clip(req, ctx, lo=s_lo, hi=s_hi)
        clip = work / f"scene_{i:02d}.mp4"
        export_mp4(frames, clip, fps=fps)
        scene_clips.append(clip)

    # 4. beat-synced assembly + audio mux
    ctx.progress(0.78, "cutting to the beat")
    out = out_dir / f"{ctx.job.job_id}.mp4"
    assemble_music_video(
        scene_clips,
        audio_path,
        audio,
        out,
        width=width,
        height=height,
        beats_per_cut=beats_per_cut,
        length_sync=length_sync,
        on_progress=lambda f: ctx.progress(0.78 + 0.17 * f, "cutting to the beat"),
    )

    # 5. optional lip sync
    if payload.get("lip_sync") and (payload.get("face_path") or payload.get("face_b64")):
        ctx.progress(0.96, "lip syncing")
        try:
            from ..models.wav2lip import lip_sync

            synced = out_dir / f"{ctx.job.job_id}_lip.mp4"
            lip_sync(
                face=payload.get("face_path"),
                audio=str(audio_path),
                out=str(synced),
            )
            out = synced
        except Exception as exc:  # noqa: BLE001
            ctx.job.message = f"lip-sync skipped: {exc}"

    # cleanup intermediates
    for f in work.glob("*"):
        f.unlink(missing_ok=True)
    work.rmdir()

    ctx.progress(1.0, "complete")
    return str(out)
