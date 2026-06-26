"""Beat-synced timeline math.

Given an audio analysis and a set of generated scene clips, decide where cuts
land (on beats/bars) and which clip plays in each segment. The compose step
then renders each segment to the exact length, guaranteeing both *beat sync*
(cuts on beats) and *length sync* (timeline == audio duration).
"""

from __future__ import annotations

from dataclasses import dataclass

from ..analysis.audio import AudioAnalysis


@dataclass
class Segment:
    start: float
    end: float
    scene_index: int

    @property
    def duration(self) -> float:
        return max(0.05, self.end - self.start)


def build_segments(
    audio: AudioAnalysis,
    n_scenes: int,
    beats_per_cut: int = 4,
    min_segment: float = 0.4,
) -> list[Segment]:
    """Create cut points on every `beats_per_cut`-th beat.

    Falls back to evenly spaced cuts if no beats were detected.
    """
    duration = audio.duration
    beats = audio.beats

    if not beats:
        # No beats -> even 2s cuts across the track.
        step = 2.0
        cuts = [i * step for i in range(int(duration // step) + 1)]
    else:
        cuts = [0.0] + beats[beats_per_cut - 1 :: beats_per_cut]

    # Always finish exactly at the track end (length sync).
    if not cuts or cuts[0] > 0.0:
        cuts = [0.0, *cuts]
    if cuts[-1] < duration:
        cuts.append(duration)

    # Drop cuts that are too close together.
    pruned = [cuts[0]]
    for c in cuts[1:]:
        if c - pruned[-1] >= min_segment:
            pruned.append(c)
    if pruned[-1] < duration:
        pruned[-1] = duration

    segments: list[Segment] = []
    for i in range(len(pruned) - 1):
        segments.append(
            Segment(start=pruned[i], end=pruned[i + 1], scene_index=i % max(1, n_scenes))
        )
    return segments
