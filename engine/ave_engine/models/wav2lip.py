"""Lip-sync stage (Wav2Lip), wired as an optional, gracefully-degrading step.

Fully running Wav2Lip needs its inference repo + checkpoints (and a face
detector). Rather than hard-failing the whole pipeline when that isn't set up,
we look for an installed implementation and raise a clear, catchable error if
it's missing — the music-video pipeline turns that into a "lip-sync skipped"
message instead of failing the render.

To enable: clone Wav2Lip, set AVE_WAV2LIP_DIR to it, and place the checkpoint at
$AVE_WAV2LIP_DIR/checkpoints/wav2lip_gan.pth (downloadable from the Hub).
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


class LipSyncUnavailable(RuntimeError):
    pass


def _wav2lip_dir() -> Path:
    d = os.environ.get("AVE_WAV2LIP_DIR")
    if not d:
        raise LipSyncUnavailable(
            "Wav2Lip not configured (set AVE_WAV2LIP_DIR to a Wav2Lip checkout)"
        )
    p = Path(d)
    if not (p / "inference.py").exists():
        raise LipSyncUnavailable(f"inference.py not found in {p}")
    return p


def lip_sync(face: str | None, audio: str, out: str) -> str:
    """Drive `face` (image or video) mouth movement from `audio`.

    Returns the output path on success; raises LipSyncUnavailable if the model
    isn't set up so callers can skip the stage cleanly.
    """
    if not face:
        raise LipSyncUnavailable("no face image/video provided")

    repo = _wav2lip_dir()
    ckpt = repo / "checkpoints" / "wav2lip_gan.pth"
    if not ckpt.exists():
        raise LipSyncUnavailable(f"missing checkpoint {ckpt}")

    cmd = [
        sys.executable,
        str(repo / "inference.py"),
        "--checkpoint_path", str(ckpt),
        "--face", face,
        "--audio", audio,
        "--outfile", out,
    ]
    proc = subprocess.run(cmd, cwd=str(repo), capture_output=True, text=True)
    if proc.returncode != 0:
        raise LipSyncUnavailable(f"wav2lip failed: {proc.stderr.strip()[:300]}")
    return out
