"""Perfect-loop builder for Spotify-Canvas-style clips.

Two strategies:
  * pingpong  -> forward + reversed; mathematically seamless, recommended.
  * crossfade -> blends the clip's end into its start; smoother motion but only
                 near-seamless.
The unit is then looped to the requested 10/20/30s target and framed to the
Canvas aspect (9:16 by default).
"""

from __future__ import annotations

from pathlib import Path

from . import ffmpeg_ops as ff


def build_loop(
    base_clip: Path,
    out_path: Path,
    target_seconds: float,
    width: int = 720,
    height: int = 1280,
    method: str = "pingpong",
    crossfade: float = 0.5,
    audio_path: Path | None = None,
    audio_start: float = 0.0,
) -> Path:
    work = out_path.parent / f"_loop_{out_path.stem}"
    work.mkdir(parents=True, exist_ok=True)

    if method == "crossfade":
        unit = ff.crossfade_loop(base_clip, work / "unit.mp4", fade=crossfade)
    else:
        unit = ff.make_pingpong(base_clip, work / "unit.mp4")

    looped = ff.loop_to_duration(unit, work / "looped.mp4", target_seconds, width, height)

    if audio_path is not None:
        ff.mux_audio(looped, audio_path, out_path, audio_start=audio_start)
    else:
        looped.replace(out_path)

    for f in work.glob("*"):
        f.unlink(missing_ok=True)
    work.rmdir()
    return out_path
