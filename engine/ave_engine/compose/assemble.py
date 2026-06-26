"""Assemble generated scene clips into a finished, audio-synced music video."""

from __future__ import annotations

from pathlib import Path

from ..analysis.audio import AudioAnalysis
from . import ffmpeg_ops as ff
from .timeline import Segment, build_segments, build_segments_from_clip_plan


def assemble_music_video(
    scene_clips: list[Path],
    audio_path: Path,
    audio: AudioAnalysis,
    out_path: Path,
    width: int,
    height: int,
    beats_per_cut: int = 4,
    length_sync: bool = True,
    use_clip_plan: bool = True,
    on_progress=None,
) -> Path:
    """Cut scene clips on beats (or clip plan) and mux the original track."""
    work = out_path.parent / f"_work_{out_path.stem}"
    work.mkdir(parents=True, exist_ok=True)

    if use_clip_plan and audio.clip_plan:
        segments = build_segments_from_clip_plan(audio, len(scene_clips), length_sync)
    else:
        segments = build_segments(audio, len(scene_clips), beats_per_cut)
        if not length_sync:
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
