"""E2E: music-video pipeline with LTX (minimal 1-scene run)."""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

for candidate in (r"F:\AIVideoStudio\data", r"E:\AIVideoStudio\data"):
    if Path(candidate).exists():
        os.environ.setdefault("AVE_DATA_DIR", candidate)
        break
os.environ.setdefault("HF_HOME", str(Path(os.environ["AVE_DATA_DIR"]) / "models"))

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
import soundfile as sf

from ave_engine.config import get_settings
from ave_engine.device import build_policy, detect_device
from ave_engine.models.manager import get_manager
from ave_engine.pipelines.music_video import run_music_video
from ave_engine.pipelines.runner import JobContext


class _Job:
    def __init__(self):
        self.job_id = "e2e_mv"
        self.cancel = False
        self.progress = 0.0
        self.step = 0
        self.total_steps = 0
        self.message = ""


def _synth_audio(path: Path, seconds: float = 12.0, bpm: float = 120.0) -> None:
    sr = 44100
    n = int(sr * seconds)
    t = np.arange(n) / sr
    beat_hz = bpm / 60.0
    kick = np.sin(2 * np.pi * beat_hz * t)
    env = (np.sin(2 * np.pi * beat_hz * t) > 0.6).astype(np.float32)
    tone = 0.25 * np.sin(2 * np.pi * 220 * t) * env
    click = 0.15 * np.sign(np.sin(2 * np.pi * beat_hz * t)) * env
    audio = np.clip(tone + click, -1, 1).astype(np.float32)
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), audio, sr)


def main() -> None:
    dev = detect_device()
    print(f"Device: {dev.name} ({dev.backend}), VRAM {dev.total_vram_gb} GB")
    print(f"Policy: {build_policy(dev).as_dict()}")

    mgr = get_manager()
    if not mgr.is_downloaded("ltx-video"):
        print("ERROR: ltx-video not downloaded")
        sys.exit(1)

    settings = get_settings()
    work = Path(settings.cache_dir) / "e2e_mv"
    work.mkdir(parents=True, exist_ok=True)
    audio = work / "test_track.wav"
    _synth_audio(audio)

    payload = {
        "model_id": "ltx-video",
        "task": "text-to-video",
        "brief": "Dark industrial cyberpunk city, neon rain, Dj MAD aesthetic",
        "audio_path": str(audio),
        "width": 512,
        "height": 320,
        "fps": 24,
        "clip_frames": 17,
        "num_inference_steps": 8,
        "guidance_scale": 3.0,
        "seed": 7,
        "n_scenes": 1,
        "beats_per_cut": 2,
        "length_sync": True,
        "lip_sync": False,
    }

    job = _Job()
    ctx = JobContext(job, settings)
    print(f"\nMusic video E2E: 1 scene, {payload['width']}x{payload['height']}, audio {audio.name}")
    t0 = time.time()
    out = run_music_video(payload, ctx)
    elapsed = time.time() - t0

    out_path = Path(out)
    size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"\nSUCCESS in {elapsed:.0f}s")
    print(f"Output: {out}")
    print(f"Size: {size_mb:.1f} MB")
    print(f"Progress: {job.progress:.0%} | {job.message}")


if __name__ == "__main__":
    main()
