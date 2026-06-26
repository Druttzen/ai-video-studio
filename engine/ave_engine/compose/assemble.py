"""Assemble generated scene clips into a finished, audio-synced music video."""

from __future__ import annotations

from pathlib import Path

from ..analysis.audio import AudioAnalysis
from . import ffmpeg_ops as ff
from .timeline import Segment, build_segments


def assemble_music_video(
    scene_clips: list[Path],
    audio_path: Path,
    audio: AudioAnalysis,
    out_path: Path,
    width: int,
    height: int,
    beats_per_cut: int = 4,
    length_sync: bool = True,
    on_progress=None,
) -> Path:
    """Cut scene clips on beats and mux the original track.

    * beat sync   -> cuts land on every `beats_per_cut`-th beat
    * length sync -> the rendered timeline equals the audio duration
    """
    work = out_path.parent / f"_work_{out_path.stem}"
    work.mkdir(parents=True, exist_ok=True)

    segments: list[Segment] = build_segments(audio, len(scene_clips), beats_per_cut)
    if not length_sync:
        # Cap to the natural sum of one pass through the clips instead.
        segments = segments[: max(1, len(scene_clips) * 2)]

    seg_files: list[Path] = []
    for i, seg in enumerate(segments):
        src = scene_clips[seg.scene_index % len(scene_clips)]
        dst = work / f"seg_{i:04d}.mp4"
        ff.take_segment(src, dst, seg.duration, width, height)
        seg_files.append(dst)
        if on_progress:
            on_progress((i + 1) / len(segments))

    silent = work / "silent.mp4"
    ff.concat(seg_files, silent)

    ff.mux_audio(silent, audio_path, out_path)

    # Best-effort cleanup of intermediates.
    for f in work.glob("*"):
        f.unlink(missing_ok=True)
    work.rmdir()
    return out_path
