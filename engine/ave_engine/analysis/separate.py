"""Optional Demucs vocal separation for lip-sync (graceful if not installed)."""

from __future__ import annotations

from pathlib import Path


def separate_vocals(audio_path: str, work_dir: Path, model_name: str = "htdemucs") -> Path | None:
    """Return path to isolated vocals WAV, or None if Demucs unavailable."""
    try:
        import numpy as np
        import soundfile as sf
        import torch
        from demucs.apply import apply_model
        from demucs.audio import AudioFile
        from demucs.pretrained import get_model
    except ImportError:
        return None

    work_dir.mkdir(parents=True, exist_ok=True)

    try:
        model = get_model(model_name)
        model.eval()
        wav = AudioFile(audio_path).read(
            streams=0,
            samplerate=model.samplerate,
            channels=model.audio_channels,
        )
        ref = wav.mean(0)
        wav = (wav - ref.mean()) / ref.std().clamp(min=1e-8)
        sources = apply_model(
            model,
            wav[None],
            device="cuda" if torch.cuda.is_available() else "cpu",
            progress=False,
        )[0]
        names = model.sources
        vocals_idx = names.index("vocals") if "vocals" in names else 0
        vocals = sources[vocals_idx].cpu()
        out_path = work_dir / "vocals.wav"
        vocals_np = vocals.squeeze().cpu().numpy()
        if vocals_np.ndim == 2:
            vocals_np = vocals_np.T
        sf.write(str(out_path), vocals_np.astype(np.float32), int(model.samplerate))
        return out_path if out_path.exists() else None
    except Exception:
        return None
