"""Thin, well-tested ffmpeg helpers used by the compose pipelines.

All functions re-encode to H.264 / yuv420p so concatenation and webview
playback are reliable. Durations are kept explicit (we always know clip length
from frames/fps or from librosa) to avoid depending on ffprobe.
"""

from __future__ import annotations

import subprocess
from pathlib import Path


def ffmpeg_exe() -> str:
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def _run(args: list[str]) -> None:
    cmd = [ffmpeg_exe(), "-y", "-hide_banner", "-loglevel", "error", *args]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {' '.join(args[:6])} ...\n{proc.stderr.strip()}")


_X264 = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20"]


def scale_pad(src: Path, dst: Path, width: int, height: int) -> Path:
    """Fit into WxH preserving aspect, padding with black (letter/pillarbox)."""
    vf = (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1"
    )
    _run(["-i", str(src), "-vf", vf, "-an", *_X264, str(dst)])
    return dst


def take_segment(src: Path, dst: Path, seconds: float, width: int, height: int) -> Path:
    """Produce exactly `seconds` of video from src (looping it if too short)."""
    vf = (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1"
    )
    _run([
        "-stream_loop", "-1", "-i", str(src),
        "-t", f"{seconds:.3f}", "-vf", vf, "-an", *_X264, str(dst),
    ])
    return dst


def concat(clips: list[Path], dst: Path) -> Path:
    """Hard-cut concatenation of same-resolution clips (beat cuts)."""
    listfile = dst.with_suffix(".txt")
    listfile.write_text("".join(f"file '{c.as_posix()}'\n" for c in clips), encoding="utf-8")
    _run(["-f", "concat", "-safe", "0", "-i", str(listfile), *_X264, str(dst)])
    listfile.unlink(missing_ok=True)
    return dst


def reverse(src: Path, dst: Path) -> Path:
    _run(["-i", str(src), "-vf", "reverse", "-an", *_X264, str(dst)])
    return dst


def make_pingpong(src: Path, dst: Path) -> Path:
    """Forward + reversed => a truly seamless loop unit (boomerang)."""
    _run([
        "-i", str(src),
        "-filter_complex", "[0:v]reverse[r];[0:v][r]concat=n=2:v=1:a=0[v]",
        "-map", "[v]", "-an", *_X264, str(dst),
    ])
    return dst


def crossfade_loop(src: Path, dst: Path, fade: float = 0.5, length: float | None = None) -> Path:
    """Blend the clip's end into its start for a smooth (near-seamless) loop.

    Requires knowing the clip length; falls back to caller-provided `length`.
    """
    if length is None:
        length = video_duration(src)
    offset = max(0.0, length - fade)
    _run([
        "-i", str(src), "-i", str(src),
        "-filter_complex",
        f"[0][1]xfade=transition=fade:duration={fade:.3f}:offset={offset:.3f},setsar=1[v]",
        "-map", "[v]", "-an", *_X264, str(dst),
    ])
    return dst


def loop_to_duration(unit: Path, dst: Path, target: float, width: int, height: int) -> Path:
    """Loop a (seamless) unit until it reaches `target` seconds at WxH."""
    vf = (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1"
    )
    _run([
        "-stream_loop", "-1", "-i", str(unit),
        "-t", f"{target:.3f}", "-vf", vf, "-an", *_X264, str(dst),
    ])
    return dst


def mux_audio(video: Path, audio: Path, dst: Path, audio_start: float = 0.0) -> Path:
    """Mux audio onto video, trimming to the shorter stream."""
    args = ["-i", str(video)]
    if audio_start > 0:
        args += ["-ss", f"{audio_start:.3f}"]
    args += [
        "-i", str(audio),
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-shortest", str(dst),
    ]
    _run(args)
    return dst


def video_duration(src: Path) -> float:
    """Duration via OpenCV frame count / fps (no ffprobe dependency)."""
    import cv2

    cap = cv2.VideoCapture(str(src))
    fps = cap.get(cv2.CAP_PROP_FPS) or 0
    frames = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
    cap.release()
    if fps <= 0:
        return 0.0
    return float(frames / fps)
