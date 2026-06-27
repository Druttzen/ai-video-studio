"""Per-segment prompt headers for beat-sync music video (ai-video-tool)."""

from __future__ import annotations

DEFAULT_PRODUCTION_MAX_CLIPS = 8


def resolve_production_clip_plan(
    clip_plan: list,
    max_clips: int = DEFAULT_PRODUCTION_MAX_CLIPS,
) -> list:
    if not clip_plan or len(clip_plan) < 2:
        return []
    cap = max(2, min(int(max_clips or DEFAULT_PRODUCTION_MAX_CLIPS), 24))
    return list(clip_plan[:cap])


def build_clip_segment_prompt(
    base_prompt: str,
    clip: dict,
    index: int,
    total: int,
) -> str:
    start = float(clip.get("start", 0))
    end = float(clip.get("end", start + float(clip.get("duration", 4))))
    label = clip.get("label") or ""
    label_bit = f" {label}" if label else ""
    header = (
        f"[MV segment {index + 1}/{total} · {start:.1f}s–{end:.1f}s"
        f"{label_bit} · cut on beat]"
    )
    body = (base_prompt or "").strip()
    return f"{header}\n{body}" if body else header
