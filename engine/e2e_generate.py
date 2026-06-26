"""End-to-end smoke test: load LTX on CUDA, generate a short clip, export MP4."""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

_data = None
for _candidate in (r"F:\AIVideoStudio\data", r"E:\AIVideoStudio\data"):
    if Path(_candidate).exists():
        _data = _candidate
        break
_data = _data or r"E:\AIVideoStudio\data"
os.environ.setdefault("AVE_DATA_DIR", _data)
os.environ.setdefault("HF_HOME", str(Path(_data) / "models"))

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ave_engine.config import get_settings
from ave_engine.device import detect_device, build_policy
from ave_engine.models.manager import get_manager
from ave_engine.schemas import GenerationRequest
from ave_engine.pipelines.single import run_generate
from ave_engine.pipelines.runner import JobContext


class _Job:
    def __init__(self):
        self.job_id = "e2e_test"
        self.cancel = False
        self.progress = 0.0
        self.step = 0
        self.total_steps = 0
        self.message = ""


def main() -> None:
    dev = detect_device()
    print(f"Device: {dev.name} ({dev.backend}), VRAM {dev.total_vram_gb} GB")
    print(f"Policy: {build_policy(dev).as_dict()}")

    mgr = get_manager()
    if not mgr.is_downloaded("ltx-video"):
        print("ERROR: ltx-video not downloaded yet")
        sys.exit(1)
    print(f"Model cached: {mgr.disk_size_gb('ltx-video')} GB on disk")

    settings = get_settings()
    job = _Job()
    ctx = JobContext(job, settings)

    req = GenerationRequest(
        model_id="ltx-video",
        task="text-to-video",
        prompt="A cinematic drone shot over a misty forest at sunrise, golden light rays",
        negative_prompt="worst quality, blurry, distorted, watermark",
        width=512,
        height=320,
        num_frames=17,
        fps=24,
        num_inference_steps=8,
        guidance_scale=3.0,
        seed=42,
    )

    print(f"\nGenerating: {req.width}x{req.height}, {req.num_frames} frames, {req.num_inference_steps} steps...")
    t0 = time.time()
    out = run_generate(req.model_dump(), ctx)
    elapsed = time.time() - t0

    out_path = Path(out)
    size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"\nSUCCESS in {elapsed:.0f}s")
    print(f"Output: {out}")
    print(f"Size: {size_mb:.1f} MB")
    print(f"Progress: {job.progress:.0%} | {job.message}")


if __name__ == "__main__":
    main()
