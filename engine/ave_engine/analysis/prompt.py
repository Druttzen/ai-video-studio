"""Chat / text-brief analyzer.

Turns a free-form brief ("moody neon cyberpunk city, rain, slow motion") plus
optional music + image analysis into a structured set of *scene prompts* and a
shared style, so a music video can have visual variety while staying coherent.

Deliberately rule-based and model-free (fast, offline, deterministic). It's a
clean extension point: swap in a local LLM later behind the same function.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .audio import AudioAnalysis
from .image import ImageAnalysis


_MOOD_WORDS = {
    "energetic": ["energetic", "fast", "party", "hype", "intense", "explosive"],
    "dreamy": ["dreamy", "ethereal", "soft", "ambient", "calm", "serene"],
    "dark": ["dark", "moody", "noir", "gloomy", "ominous", "shadow"],
    "vibrant": ["vibrant", "colorful", "neon", "vivid", "bright"],
    "cinematic": ["cinematic", "epic", "film", "movie", "dramatic"],
}

_STYLE_HINTS = [
    "cinematic", "anime", "photorealistic", "3d render", "watercolor",
    "vaporwave", "cyberpunk", "retro", "film grain", "hyperrealistic",
]


@dataclass
class PromptPlan:
    style: str
    mood: str
    negative_prompt: str
    scenes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "style": self.style,
            "mood": self.mood,
            "negative_prompt": self.negative_prompt,
            "scenes": self.scenes,
        }


def _detect_mood(text: str, audio: AudioAnalysis | None) -> str:
    low = text.lower()
    for mood, words in _MOOD_WORDS.items():
        if any(w in low for w in words):
            return mood
    if audio is not None:
        if audio.tempo >= 125:
            return "energetic"
        if audio.tempo <= 90:
            return "dreamy"
    return "cinematic"


def _detect_style(text: str) -> str:
    low = text.lower()
    found = [s for s in _STYLE_HINTS if s in low]
    return ", ".join(found) if found else "cinematic, film grain, high detail"


def _split_scenes(text: str) -> list[str]:
    # Split on sentence / clause boundaries; keep meaningful fragments.
    parts = re.split(r"[.;\n]| - |, then | and then ", text)
    return [p.strip() for p in parts if len(p.strip()) >= 3]


def build_prompt_plan(
    brief: str,
    n_scenes: int,
    audio: AudioAnalysis | None = None,
    image: ImageAnalysis | None = None,
    director_craft: dict | None = None,
) -> PromptPlan:
    brief = (brief or "").strip()
    mood = _detect_mood(brief, audio)
    style = _detect_style(brief)

    palette_suffix = ""
    if image and image.palette:
        palette_suffix = f", color palette {' '.join(image.palette[:3])}"

    motion_suffix = ""
    if audio is not None:
        motion_suffix = (
            ", dynamic camera, fast cuts" if audio.tempo >= 125 else ", smooth slow camera movement"
        )

    craft_suffix = ""
    if director_craft:
        craft_parts: list[str] = []
        for key, label in (
            ("style_line", ""),
            ("shot_type", "shot type"),
            ("camera", "camera"),
            ("lens", "lens"),
            ("film_format", "film format"),
            ("lighting", "lighting"),
            ("color_grade", "color grade"),
        ):
            val = str(director_craft.get(key) or "").strip()
            if val:
                craft_parts.append(val if not label else f"{label}: {val}")
        craft_suffix = (", " + ", ".join(craft_parts)) if craft_parts else ""

    base_scenes = _split_scenes(brief) or [brief or "abstract visuals"]

    # Cycle/extend the scene fragments up to n_scenes, decorating each.
    scenes: list[str] = []
    for i in range(max(1, n_scenes)):
        frag = base_scenes[i % len(base_scenes)]
        scenes.append(
            f"{frag}, {mood}, {style}{palette_suffix}{motion_suffix}{craft_suffix}".strip(", ")
        )

    negative = "low quality, blurry, distorted, watermark, text, deformed, jpeg artifacts"
    return PromptPlan(style=style, mood=mood, negative_prompt=negative, scenes=scenes)
