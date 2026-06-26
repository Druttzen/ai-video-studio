"""Lightweight image analysis used to bias prompts and framing.

Extracts a color palette, brightness, and aspect so the chat/prompt analyzer
can describe the source picture and the compose layer can pick sensible padding.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict

import numpy as np


@dataclass
class ImageAnalysis:
    width: int
    height: int
    aspect: float
    brightness: float          # 0..1
    palette: list[str]         # hex colors, dominant first
    is_portrait: bool

    def as_dict(self) -> dict:
        return asdict(self)


def analyze_image(path: str, n_colors: int = 5) -> ImageAnalysis:
    from PIL import Image

    img = Image.open(path).convert("RGB")
    w, h = img.size

    arr = np.asarray(img, dtype=np.float32) / 255.0
    brightness = float(arr.mean())

    # Adaptive palette quantization is a fast, dependency-free dominant-color
    # extractor (no sklearn needed).
    small = img.copy()
    small.thumbnail((128, 128))
    pal_img = small.convert("P", palette=Image.Palette.ADAPTIVE, colors=n_colors)
    palette_raw = pal_img.getpalette() or []
    counts = sorted(pal_img.getcolors() or [], reverse=True)
    palette: list[str] = []
    for _, idx in counts[:n_colors]:
        r, g, b = palette_raw[idx * 3 : idx * 3 + 3]
        palette.append(f"#{r:02x}{g:02x}{b:02x}")

    return ImageAnalysis(
        width=w,
        height=h,
        aspect=round(w / h, 4) if h else 1.0,
        brightness=round(brightness, 4),
        palette=palette,
        is_portrait=h >= w,
    )
