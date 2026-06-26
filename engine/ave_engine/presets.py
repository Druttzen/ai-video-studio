"""GPU-aware generation defaults exposed to the UI via /health."""

from __future__ import annotations


def recommended_defaults(vram_gb: float, backend: str = "cuda") -> dict:
    """Conservative defaults that actually run on the detected hardware.

    Tuned from real E2E on a 12 GB RTX 4070 SUPER: float16 + sequential offload,
    512×320, 17–25 frames, 8–20 steps.
    """
    if backend != "cuda":
        return {
            "preset": "cpu",
            "width": 512,
            "height": 320,
            "num_frames": 17,
            "fps": 24,
            "num_inference_steps": 8,
            "guidance_scale": 3.0,
            "clip_frames": 17,
            "n_scenes": 2,
        }
    if vram_gb >= 16:
        return {
            "preset": "quality",
            "width": 768,
            "height": 512,
            "num_frames": 49,
            "fps": 24,
            "num_inference_steps": 30,
            "guidance_scale": 3.0,
            "clip_frames": 49,
            "n_scenes": 4,
        }
    if vram_gb >= 10:
        return {
            "preset": "balanced",
            "width": 512,
            "height": 320,
            "num_frames": 25,
            "fps": 24,
            "num_inference_steps": 20,
            "guidance_scale": 3.0,
            "clip_frames": 25,
            "n_scenes": 3,
        }
    return {
        "preset": "fast",
        "width": 512,
        "height": 320,
        "num_frames": 17,
        "fps": 24,
        "num_inference_steps": 8,
        "guidance_scale": 3.0,
        "clip_frames": 17,
        "n_scenes": 2,
    }
