"""Music analysis with librosa.

Extracts timing information for beat-synced video: tempo, beats, downbeats,
sections, energy, onset times, vocal heuristics, and a variable-length
*clip plan* (ported from ai-video-tool music-video sync).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass
class ClipPlanEntry:
    start: float
    end: float
    duration: float
    label: str = ""

    def as_dict(self) -> dict:
        return {
            "start": round(self.start, 3),
            "end": round(self.end, 3),
            "duration": round(self.duration, 3),
            "label": self.label,
        }


@dataclass
class AudioAnalysis:
    duration: float
    tempo: float
    beats: list[float]
    downbeats: list[float] = field(default_factory=list)
    sections: list[float] = field(default_factory=list)
    energy: list[float] = field(default_factory=list)
    beats_per_bar: int = 4
    onsets: list[float] = field(default_factory=list)
    vocals_likely: bool = False
    clip_plan: list[ClipPlanEntry] = field(default_factory=list)
    range_start: float = 0.0
    range_end: float = 0.0
    highlight_start: float = 0.0
    highlight_end: float = 0.0
    summary: str = ""

    @property
    def clip_count(self) -> int:
        return len(self.clip_plan)

    @property
    def clip_duration_sec(self) -> float:
        return sum(c.duration for c in self.clip_plan)

    def as_dict(self) -> dict:
        return {
            "duration": round(self.duration, 3),
            "tempo": round(self.tempo, 2),
            "beats": [round(b, 3) for b in self.beats],
            "downbeats": [round(b, 3) for b in self.downbeats],
            "sections": [round(s, 3) for s in self.sections],
            "energy": [round(float(e), 4) for e in self.energy],
            "beats_per_bar": self.beats_per_bar,
            "num_beats": len(self.beats),
            "onsets": [round(o, 3) for o in self.onsets],
            "vocals_likely": self.vocals_likely,
            "clip_plan": [c.as_dict() for c in self.clip_plan],
            "clip_count": self.clip_count,
            "clip_duration_sec": round(self.clip_duration_sec, 3),
            "range_start": round(self.range_start, 3),
            "range_end": round(self.range_end, 3),
            "highlight_start": round(self.highlight_start, 3),
            "highlight_end": round(self.highlight_end, 3),
            "summary": self.summary,
        }


def build_clip_plan(
    beat_times: list[float],
    range_start: float,
    range_end: float,
    *,
    min_sec: float = 4.0,
    max_sec: float = 8.0,
    max_clips: int = 0,
) -> list[ClipPlanEntry]:
    """Variable-length segments aligned to beats (ai-video-tool clipPlan)."""
    beats = [t for t in beat_times if range_start <= t <= range_end]
    if len(beats) < 2:
        return []

    clips: list[ClipPlanEntry] = []
    i = 0
    while i < len(beats) - 1:
        if max_clips > 0 and len(clips) >= max_clips:
            break
        start = beats[i]
        j = i + 1
        while j < len(beats) and beats[j] - start < min_sec:
            j += 1
        if j >= len(beats):
            break
        end_idx = j
        while end_idx + 1 < len(beats) and beats[end_idx + 1] - start <= max_sec:
            end_idx += 1
        end = beats[end_idx]
        if end - start >= min_sec * 0.75:
            clips.append(
                ClipPlanEntry(
                    start=start,
                    end=end,
                    duration=end - start,
                    label=f"Segment {len(clips) + 1}",
                )
            )
        i = end_idx
    return clips


def estimate_vocals_likely(y: np.ndarray, sr: int) -> bool:
    """Heuristic: dynamic + spectral cues suggest vocals (for lip-sync hint)."""
    try:
        import librosa

        rms = librosa.feature.rms(y=y)[0]
        zcr = librosa.feature.zero_crossing_rate(y=y)[0]
        centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        if len(rms) < 4:
            return False
        dynamic = float(np.std(rms) / (np.mean(rms) + 1e-6))
        zcr_mean = float(np.mean(zcr))
        centroid_mean = float(np.mean(centroid))
        return dynamic > 0.35 and zcr_mean > 0.04 and centroid_mean > 1200
    except Exception:
        return False


def analyze_audio(
    path: str,
    beats_per_bar: int = 4,
    *,
    range_start: float = 0.0,
    range_end: float = -1.0,
    min_clip_sec: float = 4.0,
    max_clip_sec: float = 8.0,
    max_clips: int = 0,
) -> AudioAnalysis:
    import librosa

    y, sr = librosa.load(path, sr=22050, mono=True)
    duration = float(librosa.get_duration(y=y, sr=sr))

    r_start = max(0.0, float(range_start))
    r_end = duration if range_end < 0 else min(duration, float(range_end))
    if r_end <= r_start:
        r_start, r_end = 0.0, duration

    start_sample = int(r_start * sr)
    end_sample = max(start_sample + 1, int(r_end * sr))
    segment = y[start_sample:end_sample]

    tempo_val = 120.0
    beats: list[float] = []
    try:
        tempo, beat_frames = librosa.beat.beat_track(y=segment, sr=sr, units="frames")
        tempo_val = float(np.atleast_1d(tempo)[0])
        beats = [float(t) + r_start for t in librosa.frames_to_time(beat_frames, sr=sr)]
    except Exception:
        try:
            tempo_arr = librosa.feature.rhythm.tempo(y=segment, sr=sr)
            tempo_val = float(tempo_arr[0] if len(tempo_arr) else 120.0)
        except Exception:
            tempo_val = 120.0

    onsets: list[float] = []
    try:
        onset_env = librosa.onset.onset_strength(y=segment, sr=sr)
        onset_frames = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr, backtrack=True)
        onsets = [
            round(float(t) + r_start, 4)
            for t in librosa.frames_to_time(onset_frames, sr=sr)
        ][:240]
    except Exception:
        onsets = []

    if len(beats) < 2 and tempo_val > 0:
        interval = 60.0 / tempo_val
        t = r_start
        beats = []
        while t <= r_end + 0.001:
            beats.append(round(t, 4))
            t += interval

    downbeats = beats[::beats_per_bar] if beats else []

    hop = 512
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop)
    energy = _resample_curve(times, rms, duration, rate=10.0)
    sections = _detect_sections(y, sr)

    clip_plan = build_clip_plan(
        beats,
        r_start,
        r_end,
        min_sec=max(2.0, float(min_clip_sec)),
        max_sec=max(3.0, float(max_clip_sec)),
        max_clips=max(0, int(max_clips)),
    )
    vocals_likely = estimate_vocals_likely(segment, sr)
    hi_start, hi_end = _highlight_window(energy, duration)

    summary = (
        f"{round(tempo_val)} BPM, {round(duration, 1)}s track, "
        f"{len(beats)} beats, highlight {round(hi_start, 1)}–{round(hi_end, 1)}s"
        + (" (vocals likely)" if vocals_likely else "")
    )

    return AudioAnalysis(
        duration=duration,
        tempo=tempo_val,
        beats=beats,
        downbeats=downbeats,
        sections=sections,
        energy=energy,
        beats_per_bar=beats_per_bar,
        onsets=onsets,
        vocals_likely=vocals_likely,
        clip_plan=clip_plan,
        range_start=r_start,
        range_end=r_end,
        highlight_start=hi_start,
        highlight_end=hi_end,
        summary=summary,
    )


def _highlight_window(energy: list[float], duration: float, window_sec: float = 30.0) -> tuple[float, float]:
    if not energy or duration <= 0:
        return 0.0, min(window_sec, duration)
    rate = len(energy) / max(duration, 1e-3)
    win = max(1, int(window_sec * rate))
    best_i, best_sum = 0, -1.0
    for i in range(max(1, len(energy) - win + 1)):
        chunk = sum(energy[i : i + win])
        if chunk > best_sum:
            best_sum, best_i = chunk, i
    start = best_i / rate
    end = min(duration, start + window_sec)
    if end - start < 6:
        mid = duration / 2
        start = max(0.0, mid - 15)
        end = min(duration, mid + 15)
    return round(start, 3), round(end, 3)


def _resample_curve(times: np.ndarray, values: np.ndarray, duration: float, rate: float) -> list[float]:
    if len(values) == 0:
        return []
    grid = np.arange(0, max(duration, 1e-3), 1.0 / rate)
    interp = np.interp(grid, times, values)
    vmax = float(interp.max()) or 1.0
    return list(interp / vmax)


def _detect_sections(y: np.ndarray, sr: int) -> list[float]:
    try:
        import librosa

        hop = 512
        S = np.abs(librosa.stft(y, hop_length=hop))
        novelty = librosa.onset.onset_strength(S=librosa.amplitude_to_db(S, ref=np.max), sr=sr, hop_length=hop)
        peaks = librosa.util.peak_pick(
            novelty, pre_max=20, post_max=20, pre_avg=40, post_avg=40, delta=0.2, wait=int(8 * sr / hop)
        )
        times = librosa.frames_to_time(peaks, sr=sr, hop_length=hop)
        return [0.0] + [float(t) for t in times]
    except Exception:
        return [0.0]
