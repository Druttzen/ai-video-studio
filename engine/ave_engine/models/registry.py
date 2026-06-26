"""Catalog of supported open-source video models.

Adding a new model is a two-step job: append a :class:`ModelSpec` here and add
the matching adapter in :mod:`ave_engine.models`. The UI's Model Manager is
driven entirely by this list, so nothing else needs to change.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict


@dataclass(frozen=True)
class ModelSpec:
    id: str                      # stable internal id used by the API/UI
    name: str                    # human friendly name
    repo_id: str                 # Hugging Face repo
    adapter: str                 # adapter key -> ave_engine.models.<adapter>
    tasks: tuple[str, ...]       # subset of {"text-to-video", "image-to-video"}
    license: str
    commercial_use: bool
    min_vram_gb: float           # recommended minimum for a comfortable run
    approx_size_gb: float        # rough download size, for the UI
    description: str = ""
    default_params: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        d = asdict(self)
        d["tasks"] = list(self.tasks)
        return d


# Curated, all open-source. Sizes/VRAM are approximate guidance for the UI.
MODELS: list[ModelSpec] = [
    ModelSpec(
        id="ltx-video",
        name="LTX-Video",
        repo_id="Lightricks/LTX-Video",
        adapter="ltx",
        tasks=("text-to-video", "image-to-video"),
        license="OpenRAIL-M (RAIL)",
        commercial_use=True,
        min_vram_gb=8.0,
        approx_size_gb=28.0,
        description=(
            "Fast DiT-based video model. ~28 GB download (pipeline components only). "
            "Best on 8–12 GB GPUs at 512×320; scale up on 16+ GB."
        ),
        default_params={
            "width": 512,
            "height": 320,
            "num_frames": 25,
            "fps": 24,
            "num_inference_steps": 20,
            "guidance_scale": 3.0,
        },
    ),
    ModelSpec(
        id="cogvideox-2b",
        name="CogVideoX-2B",
        repo_id="THUDM/CogVideoX-2b",
        adapter="cogvideox",
        tasks=("text-to-video",),
        license="Apache-2.0",
        commercial_use=True,
        min_vram_gb=8.0,
        approx_size_gb=12.0,
        description=(
            "High-quality text-to-video. Apache-2.0 weights, fully commercial-"
            "friendly. Runs on 8+ GB with CPU offload."
        ),
        default_params={
            "width": 720,
            "height": 480,
            "num_frames": 49,
            "fps": 8,
            "num_inference_steps": 50,
            "guidance_scale": 6.0,
        },
    ),
    ModelSpec(
        id="svd-xt",
        name="Stable Video Diffusion (XT)",
        repo_id="stabilityai/stable-video-diffusion-img2vid-xt",
        adapter="svd",
        tasks=("image-to-video",),
        license="Stability AI Non-Commercial",
        commercial_use=False,
        min_vram_gb=10.0,
        approx_size_gb=9.5,
        description=(
            "Image-to-video, 25 frames. NON-COMMERCIAL license — research/"
            "personal use only."
        ),
        default_params={
            "width": 1024,
            "height": 576,
            "num_frames": 25,
            "fps": 7,
            "num_inference_steps": 25,
            "motion_bucket_id": 127,
        },
    ),
]

_BY_ID = {m.id: m for m in MODELS}


def all_models() -> list[ModelSpec]:
    return list(MODELS)


def get_spec(model_id: str) -> ModelSpec:
    try:
        return _BY_ID[model_id]
    except KeyError as exc:
        raise KeyError(f"Unknown model id: {model_id!r}") from exc
