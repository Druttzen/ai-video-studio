"""Pydantic request/response models shared by the API and the job runner."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class GenerationRequest(BaseModel):
    model_id: str
    task: str = Field("text-to-video", description="text-to-video | image-to-video")
    prompt: str = ""
    negative_prompt: str = ""

    # Image-to-video input: a path on disk or a data URL (base64) from the UI.
    image_path: Optional[str] = None
    image_b64: Optional[str] = None

    width: int = 768
    height: int = 512
    num_frames: int = 49
    fps: int = 24
    num_inference_steps: int = 40
    guidance_scale: float = 3.0
    seed: Optional[int] = None

    # Model-specific extras (e.g. motion_bucket_id for SVD).
    extra: dict = Field(default_factory=dict)


class GenerationResponse(BaseModel):
    job_id: str


class JobStatus(BaseModel):
    job_id: str
    kind: str = "generate"
    label: str = ""
    status: str            # queued | running | done | error | cancelled
    progress: float        # 0..1
    step: int = 0
    total_steps: int = 0
    message: str = ""
    output_path: Optional[str] = None
    error: Optional[str] = None
    request: Optional[dict] = None


class AnalyzeAudioRequest(BaseModel):
    audio_b64: Optional[str] = None
    audio_path: Optional[str] = None
    beats_per_bar: int = 4
    range_start: float = 0.0
    range_end: float = -1.0
    min_clip_sec: float = 4.0
    max_clip_sec: float = 8.0
    max_clips: int = 0


class AnalyzeImageRequest(BaseModel):
    image_b64: Optional[str] = None
    image_path: Optional[str] = None


class MusicVideoRequest(BaseModel):
    model_id: str
    task: str = "text-to-video"
    brief: str = ""

    audio_b64: Optional[str] = None
    audio_path: Optional[str] = None
    image_b64: Optional[str] = None        # base picture for image-to-video
    image_path: Optional[str] = None
    face_b64: Optional[str] = None         # face for optional lip-sync
    face_path: Optional[str] = None

    width: int = 768
    height: int = 512
    fps: int = 24
    clip_frames: int = 49
    num_inference_steps: int = 40
    guidance_scale: float = 3.0
    seed: Optional[int] = None

    n_scenes: int = 4
    beats_per_cut: int = 4
    beats_per_bar: int = 4
    length_sync: bool = True
    lip_sync: bool = False
    use_clip_plan: bool = True
    range_start: float = 0.0
    range_end: float = -1.0
    min_clip_sec: float = 4.0
    max_clip_sec: float = 8.0
    max_clips: int = 8
    duration_mode: str = "full"
    separate_vocals: bool = False
    director_craft: dict = Field(default_factory=dict)


class CanvasRequest(BaseModel):
    model_id: str
    task: str = "text-to-video"
    brief: str = "looping abstract motion"

    audio_b64: Optional[str] = None
    audio_path: Optional[str] = None
    image_b64: Optional[str] = None
    image_path: Optional[str] = None

    target_seconds: int = 20               # 10 | 20 | 30
    width: int = 720
    height: int = 1280
    fps: int = 24
    clip_frames: int = 49
    num_inference_steps: int = 40
    guidance_scale: float = 3.0
    seed: Optional[int] = None

    loop_method: str = "pingpong"          # pingpong | crossfade
    crossfade: float = 0.5
    with_audio: bool = True
