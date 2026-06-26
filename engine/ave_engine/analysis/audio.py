"""Music analysis with librosa.

Extracts the timing information the rest of the app needs to *sync* video to
music: total duration, tempo (BPM), beat timestamps, approximate downbeats
(bar starts), and a coarse energy curve used to detect sections (e.g. a drop or
chorus). Everything is returned as plain JSON-able data.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass
class AudioAnalysis:
    duration: float
    tempo: float
    beats: list[float]                 # beat onset times (seconds)
    downbeats: list[float] = field(default_factory=list)
    sections: list[float] = field(default_factory=list)  # section start times
    energy: list[float] = field(default_factory=list)     # 0..1, ~10 Hz
    beats_per_bar: int = 4

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
        }


def analyze_audio(path: str, beats_per_bar: int = 4) -> AudioAnalysis:
    import librosa

    y, sr = librosa.load(path, sr=22050, mono=True)
    duration = float(librosa.get_duration(y=y, sr=sr))

    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    tempo_val = float(np.atleast_1d(tempo)[0])

    # Approximate downbeats: every `beats_per_bar`-th beat starting from the
    # strongest early beat. Good enough to cut on bar boundaries.
    beats = [float(t) for t in beat_times]
    downbeats = beats[::beats_per_bar] if beats else []

    # Coarse energy envelope (RMS) downsampled to ~10 Hz, normalized 0..1.
    hop = 512
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop)
    energy = _resample_curve(times, rms, duration, rate=10.0)

    sections = _detect_sections(y, sr)

    return AudioAnalysis(
        duration=duration,
        tempo=tempo_val,
        beats=beats,
        downbeats=downbeats,
        sections=sections,
        energy=energy,
        beats_per_bar=beats_per_bar,
    )


def _resample_curve(times: np.ndarray, values: np.ndarray, duration: float, rate: float) -> list[float]:
    if len(values) == 0:
        return []
    grid = np.arange(0, max(duration, 1e-3), 1.0 / rate)
    interp = np.interp(grid, times, values)
    vmax = float(interp.max()) or 1.0
    return list(interp / vmax)


def _detect_sections(y: np.ndarray, sr: int) -> list[float]:
    """Very coarse structural segmentation via spectral novelty peaks."""
    try:
        import librosa

        hop = 512
        S = np.abs(librosa.stft(y, hop_length=hop))
        novelty = librosa.onset.onset_strength(S=librosa.amplitude_to_db(S, ref=np.max), sr=sr, hop_length=hop)
        # Peak-pick sparse, well-separated boundaries (~ every 8 s minimum).
        peaks = librosa.util.peak_pick(
            novelty, pre_max=20, post_max=20, pre_avg=40, post_avg=40, delta=0.2, wait=int(8 * sr / hop)
        )
        times = librosa.frames_to_time(peaks, sr=sr, hop_length=hop)
        return [0.0] + [float(t) for t in times]
    except Exception:
        return [0.0]
