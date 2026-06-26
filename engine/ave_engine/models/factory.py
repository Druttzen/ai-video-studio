"""Build a loaded :class:`VideoModel` from a model id, with a tiny cache.

Loading a diffusion pipeline is expensive, so we keep the most recently used
model resident and only swap when a different model is requested (freeing VRAM
first). A single-model cache matches the single-worker job runner.
"""

from __future__ import annotations

from ..device import build_policy
from . import registry
from .base import VideoModel
from .cogvideox import CogVideoXModel
from .ltx import LTXModel
from .svd import SVDModel

_ADAPTERS = {
    "ltx": LTXModel,
    "cogvideox": CogVideoXModel,
    "svd": SVDModel,
}

_current: VideoModel | None = None
_current_id: str | None = None


def get_model(model_id: str) -> VideoModel:
    global _current, _current_id
    if _current is not None and _current_id == model_id:
        return _current

    if _current is not None:
        _current.unload()
        _current = None
        _current_id = None

    spec = registry.get_spec(model_id)
    cls = _ADAPTERS[spec.adapter]
    model = cls(spec.repo_id, policy=build_policy())
    model.spec_id = spec.id
    _current = model
    _current_id = model_id
    return model
