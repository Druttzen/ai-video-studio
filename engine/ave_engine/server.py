"""FastAPI app exposing the engine to the Rust/Tauri backend.

Everything is localhost-only. The Rust side spawns this process, reads the
chosen port from stdout, then proxies UI requests here.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from . import __version__
from .config import get_settings
from .device import build_policy, detect_device
from .presets import recommended_defaults
from .jobs import get_jobs
from .models.manager import get_manager
from .models.registry import all_models
from .onboarding import get_state as get_onboarding_state, mark_complete as mark_onboarding_complete
from .schemas import (
    AnalyzeAudioRequest,
    AnalyzeImageRequest,
    CanvasRequest,
    GenerationRequest,
    GenerationResponse,
    JobStatus,
    MusicVideoRequest,
)
from .uploads import save_data_url

app = FastAPI(title="AI Video Studio Engine", version=__version__)

# The webview origin (tauri://localhost / http://localhost:1420) talks to the
# Rust proxy, but allow direct calls in dev too.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    info = detect_device()
    mgr = get_manager()
    has_model = any(mgr.is_downloaded(m.id) for m in all_models())
    onboarding = get_onboarding_state()
    return {
        "status": "ok",
        "version": __version__,
        "device": info.as_dict(),
        "policy": build_policy(info).as_dict(),
        "recommended_defaults": recommended_defaults(info.total_vram_gb, info.backend),
        "settings": get_settings().to_dict(),
        "onboarding": {
            "complete": bool(onboarding.get("complete")),
            "has_model": has_model,
            "default_model_id": "ltx-video",
        },
    }


@app.post("/onboarding/complete")
def complete_onboarding() -> dict:
    return mark_onboarding_complete()


@app.get("/models")
def list_models() -> list[dict]:
    return get_manager().status_all()


@app.get("/models/{model_id}")
def model_status(model_id: str) -> dict:
    try:
        return get_manager().status(model_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.post("/models/{model_id}/download")
def download_model(model_id: str) -> dict:
    try:
        return get_manager().start_download(model_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.delete("/models/{model_id}")
def delete_model(model_id: str) -> dict:
    try:
        return get_manager().delete(model_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


def _require_model(model_id: str) -> None:
    if not get_manager().is_downloaded(model_id):
        raise HTTPException(
            status_code=409, detail=f"Model '{model_id}' is not downloaded yet."
        )


@app.post("/generate", response_model=GenerationResponse)
def generate(req: GenerationRequest) -> GenerationResponse:
    _require_model(req.model_id)
    job = get_jobs().submit("generate", req.model_dump(), label=req.prompt[:60])
    return GenerationResponse(job_id=job.job_id)


@app.post("/analyze/audio")
def analyze_audio_endpoint(req: AnalyzeAudioRequest) -> dict:
    from .analysis.audio import analyze_audio

    path = req.audio_path or (req.audio_b64 and save_data_url(req.audio_b64, ".mp3"))
    if not path:
        raise HTTPException(status_code=400, detail="audio_b64 or audio_path required")
    try:
        return {
            "path": path,
            **analyze_audio(
                path,
                beats_per_bar=req.beats_per_bar,
                range_start=req.range_start,
                range_end=req.range_end,
                min_clip_sec=req.min_clip_sec,
                max_clip_sec=req.max_clip_sec,
                max_clips=req.max_clips,
            ).as_dict(),
        }
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"audio analysis failed: {exc}")


@app.post("/analyze/image")
def analyze_image_endpoint(req: AnalyzeImageRequest) -> dict:
    from .analysis.image import analyze_image

    path = req.image_path or (req.image_b64 and save_data_url(req.image_b64, ".png"))
    if not path:
        raise HTTPException(status_code=400, detail="image_b64 or image_path required")
    try:
        return {"path": path, **analyze_image(path).as_dict()}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"image analysis failed: {exc}")


@app.post("/projects/music-video", response_model=GenerationResponse)
def music_video(req: MusicVideoRequest) -> GenerationResponse:
    _require_model(req.model_id)
    payload = req.model_dump()

    if not (payload.get("audio_path") or payload.get("audio_b64")):
        raise HTTPException(status_code=400, detail="a music file is required")
    if payload.get("audio_b64"):
        payload["audio_path"] = save_data_url(payload.pop("audio_b64"), ".mp3")
    if payload.get("image_b64"):
        payload["image_path"] = save_data_url(payload.pop("image_b64"), ".png")
    if payload.get("face_b64"):
        payload["face_path"] = save_data_url(payload.pop("face_b64"), ".png")

    job = get_jobs().submit("music-video", payload, label=req.brief[:60] or "music video")
    return GenerationResponse(job_id=job.job_id)


@app.post("/projects/canvas", response_model=GenerationResponse)
def canvas(req: CanvasRequest) -> GenerationResponse:
    _require_model(req.model_id)
    payload = req.model_dump()

    if payload.get("audio_b64"):
        payload["audio_path"] = save_data_url(payload.pop("audio_b64"), ".mp3")
    if payload.get("image_b64"):
        payload["image_path"] = save_data_url(payload.pop("image_b64"), ".png")

    job = get_jobs().submit("canvas", payload, label=req.brief[:60] or "canvas loop")
    return GenerationResponse(job_id=job.job_id)


@app.get("/jobs", response_model=list[JobStatus])
def list_jobs() -> list[dict]:
    return get_jobs().list()


@app.get("/jobs/{job_id}", response_model=JobStatus)
def job_status(job_id: str) -> dict:
    job = get_jobs().get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job.to_status()


@app.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: str) -> dict:
    ok = get_jobs().cancel(job_id)
    if not ok:
        raise HTTPException(status_code=409, detail="job not cancellable")
    return {"cancelled": True}


@app.get("/outputs/{filename}")
def get_output(filename: str) -> FileResponse:
    path = Path(get_settings().outputs_dir) / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="not found")
    return FileResponse(str(path), media_type="video/mp4")
