"""Frame -> video export.

We encode H.264 in an MP4 (yuv420p) so the result plays everywhere, including
inside the app's webview. imageio-ffmpeg ships a static ffmpeg binary, so there
is no system dependency for the user to install.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np


def export_mp4(frames: list[np.ndarray], out_path: Path, fps: int = 24) -> Path:
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    import imageio.v3 as iio

    # Even dimensions are required by yuv420p; pad by one row/col if needed.
    frames = [_ensure_even(f) for f in frames]

    iio.imwrite(
        out_path,
        np.stack(frames, axis=0),
        fps=fps,
        codec="libx264",
        pixelformat="yuv420p",
        output_params=["-movflags", "+faststart", "-crf", "18"],
    )
    return out_path


def _ensure_even(frame: np.ndarray) -> np.ndarray:
    h, w = frame.shape[:2]
    ph, pw = h % 2, w % 2
    if ph or pw:
        frame = np.pad(frame, ((0, ph), (0, pw), (0, 0)), mode="edge")
    return frame
