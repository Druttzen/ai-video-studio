"""Image analysis used to bias prompts and framing.

Extracts palette, brightness, aspect, visual mood, and creative hints
(ported from ai-video-tool image-analyzer.js).
"""

from __future__ import annotations

from dataclasses import dataclass, asdict

import numpy as np


@dataclass
class ImageAnalysis:
    width: int
    height: int
    aspect: float
    brightness: float
    palette: list[str]
    is_portrait: bool
    avg_color: str = ""
    dominant_hue: int = 0
    hue_label: str = ""
    color_temperature: str = "neutral"
    aspect_label: str = "landscape"
    saturation: float = 0.0
    contrast: float = 0.0
    visual_mood: str = ""
    suggested_genres: list[str] = None  # type: ignore[assignment]
    suggested_sounds: list[str] = None  # type: ignore[assignment]
    suggested_rhythms: list[str] = None  # type: ignore[assignment]
    summary: str = ""

    def __post_init__(self) -> None:
        if self.suggested_genres is None:
            self.suggested_genres = []
        if self.suggested_sounds is None:
            self.suggested_sounds = []
        if self.suggested_rhythms is None:
            self.suggested_rhythms = []

    def as_dict(self) -> dict:
        return asdict(self)


def _rgb_to_hue(r: float, g: float, b: float) -> int:
    mx, mn = max(r, g, b), min(r, g, b)
    if mx == mn:
        return 0
    d = mx - mn
    if mx == r:
        h = ((g - b) / d) % 6
    elif mx == g:
        h = (b - r) / d + 2
    else:
        h = (r - g) / d + 4
    deg = int(round(h * 60))
    return deg + 360 if deg < 0 else deg


def _hue_label(hue: int) -> str:
    if hue < 15 or hue >= 345:
        return "red"
    if hue < 45:
        return "orange"
    if hue < 75:
        return "yellow"
    if hue < 165:
        return "green"
    if hue < 195:
        return "cyan"
    if hue < 255:
        return "blue"
    if hue < 285:
        return "violet"
    return "magenta"


def _aspect_label(width: int, height: int) -> str:
    if not width or not height:
        return "unknown"
    ratio = width / height
    if ratio > 1.2:
        return "landscape"
    if ratio < 0.85:
        return "portrait"
    return "square"


def _palette_suggestions(
    *,
    dark: bool,
    cool: bool,
    warm: bool,
    vivid: bool,
    bright: bool,
    high_contrast: bool,
) -> tuple[list[str], list[str], list[str]]:
    genres: list[str] = []
    sounds: list[str] = []
    rhythms: list[str] = []
    if dark:
        genres += ["Dark Ambient", "Industrial", "Synthwave"]
        sounds += ["Dark pads", "Sub bass", "Reverb tails"]
        rhythms += ["Slow", "Minimal"]
    if cool:
        genres += ["Ambient", "Electronica"]
        sounds += ["Cold synths", "Atmospheric textures"]
    if warm:
        genres += ["Soul", "R&B", "Lo-fi"]
        sounds += ["Warm keys", "Analog synths"]
    if vivid:
        genres += ["Pop", "Dance", "Hyperpop"]
        sounds += ["Bright leads", "Punchy drums"]
        rhythms += ["Upbeat", "Syncopated"]
    if bright:
        sounds += ["Shimmering highs", "Air"]
    if high_contrast:
        rhythms += ["Driving", "Staccato"]
    if not genres:
        genres = ["Cinematic", "Experimental"]
    if not sounds:
        sounds = ["Analog synths", "Atmospheric textures"]
    if not rhythms:
        rhythms = ["Steady", "4/4"]
    return genres[:4], sounds[:4], rhythms[:3]


def analyze_image(path: str, n_colors: int = 5) -> ImageAnalysis:
    from PIL import Image

    img = Image.open(path).convert("RGB")
    w, h = img.size

    arr = np.asarray(img, dtype=np.float32)
    r_ch, g_ch, b_ch = arr[..., 0], arr[..., 1], arr[..., 2]
    brightness_255 = float((0.2126 * r_ch + 0.7152 * g_ch + 0.0722 * b_ch).mean())
    brightness = brightness_255 / 255.0

    mx = np.maximum(np.maximum(r_ch, g_ch), b_ch)
    mn = np.minimum(np.minimum(r_ch, g_ch), b_ch)
    sat = np.where(mx > 0, (mx - mn) / mx, 0.0)
    saturation = float(sat.mean() * 100)

    lum = 0.2126 * r_ch + 0.7152 * g_ch + 0.0722 * b_ch
    contrast = float(np.abs(lum - lum.mean()).mean())

    r = int(r_ch.mean())
    g = int(g_ch.mean())
    b = int(b_ch.mean())
    warm = r > b + 15
    cool = b > r + 15
    dark = brightness_255 < 95
    bright = brightness_255 > 165
    vivid = saturation > 45
    high_contrast = contrast > 45

    small = img.copy()
    small.thumbnail((128, 128))
    pal_img = small.convert("P", palette=Image.Palette.ADAPTIVE, colors=n_colors)
    palette_raw = pal_img.getpalette() or []
    counts = sorted(pal_img.getcolors() or [], reverse=True)
    palette: list[str] = []
    for _, idx in counts[:n_colors]:
        pr, pg, pb = palette_raw[idx * 3 : idx * 3 + 3]
        palette.append(f"#{pr:02x}{pg:02x}{pb:02x}")

    hue = _rgb_to_hue(r, g, b)
    hl = _hue_label(hue)
    color_temp = "warm" if warm else "cool" if cool else "neutral"
    aspect_lbl = _aspect_label(w, h)
    visual_mood = (
        f"{'dark' if dark else 'bright' if bright else 'balanced'}, "
        f"{'vivid' if vivid else 'muted'}, "
        f"{'high-contrast' if high_contrast else 'soft-contrast'}, "
        f"{color_temp}"
    )
    genres, sounds, rhythms = _palette_suggestions(
        dark=dark,
        cool=cool,
        warm=warm,
        vivid=vivid,
        bright=bright,
        high_contrast=high_contrast,
    )
    summary = (
        f"Visual mood: {visual_mood}. "
        f"Palette: {', '.join(palette[:3])}. "
        f"Suggested look: {', '.join(genres[:2])}, {', '.join(sounds[:2])}."
    )

    return ImageAnalysis(
        width=w,
        height=h,
        aspect=round(w / h, 4) if h else 1.0,
        brightness=round(brightness, 4),
        palette=palette,
        is_portrait=h >= w,
        avg_color=f"rgb({r}, {g}, {b})",
        dominant_hue=hue,
        hue_label=hl,
        color_temperature=color_temp,
        aspect_label=aspect_lbl,
        saturation=round(saturation, 2),
        contrast=round(contrast, 2),
        visual_mood=visual_mood,
        suggested_genres=genres,
        suggested_sounds=sounds,
        suggested_rhythms=rhythms,
        summary=summary,
    )
