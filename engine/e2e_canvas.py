"""E2E: Spotify Canvas pipeline with LTX (10s pingpong loop)."""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

_data = Path(__file__).resolve().parent.parent / "data"
os.environ.setdefault("AVE_DATA_DIR", str(_data))
os.environ.setdefault("HF_HOME", str(_data / "models"))

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
import soundfile as sf

from ave_engine.config import get_settings
from ave_engine.device import build_policy, detect_device
from ave_engine.models.manager import get_manager
from ave_engine.pipelines.canvas import run_canvas
from ave_engine.pipelines.runner import JobContext


class _Job:
    def __init__(self):
        self.job_id = "e2e_canvas"
        self.cancel = False
        self.progress = 0.0
        self.step = 0
        self.total_steps = 0
        self.message = ""


def _synth_audio(path: Path, seconds: float = 15.0) -> None:
    sr = 44100
    t = np.arange(int(sr * seconds)) / sr
    audio = (0.2 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), audio, sr)


def main() -> None:
    dev = detect_device()
    print(f"Device: {dev.name} ({dev.backend}), VRAM {dev.total_vram_gb} GB")

    mgr = get_manager()
    if not mgr.is_downloaded("ltx-video"):
        print("ERROR: ltx-video not downloaded")
        sys.exit(1)

    settings = get_settings()
    work = Path(settings.cache_dir) / "e2e_canvas"
    work.mkdir(parents=True, exist_ok=True)
    audio = work / "snippet.wav"
    _synth_audio(audio)

    payload = {
        "model_id": "ltx-video",
        "task": "text-to-video",
        "brief": "Hypnotic looping smoke and biohazard symbols, monochrome, vertical motion",
        "audio_path": str(audio),
        "target_seconds": 10,
        "width": 512,
        "height": 768,
        "fps": 24,
        "clip_frames": 17,
        "num_inference_steps": 8,
        "guidance_scale": 3.0,
        "seed": 99,
        "loop_method": "pingpong",
        "with_audio": True,
    }

    job = _Job()
    ctx = JobContext(job, settings)
    print(f"\nCanvas E2E: {payload['target_seconds']}s loop, {payload['width']}x{payload['height']}")
    t0 = time.time()
    out = run_canvas(payload, ctx)
    elapsed = time.time() - t0

    out_path = Path(out)
    size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"\nSUCCESS in {elapsed:.0f}s")
    print(f"Output: {out}")
    print(f"Size: {size_mb:.1f} MB")


if __name__ == "__main__":
    main()
