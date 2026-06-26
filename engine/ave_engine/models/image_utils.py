"""Helpers for image-to-video input loading."""

from __future__ import annotations

import base64
import io

from ..schemas import GenerationRequest


def load_image(req: GenerationRequest):
    """Resolve the request's input image to a PIL.Image (RGB, resized)."""
    from PIL import Image

    if req.image_b64:
        raw = req.image_b64
        if "," in raw and raw.strip().startswith("data:"):
            raw = raw.split(",", 1)[1]
        img = Image.open(io.BytesIO(base64.b64decode(raw)))
    elif req.image_path:
        img = Image.open(req.image_path)
    else:
        raise ValueError("image-to-video requires image_path or image_b64")

    img = img.convert("RGB")
    if req.width and req.height:
        img = img.resize((req.width, req.height))
    return img
