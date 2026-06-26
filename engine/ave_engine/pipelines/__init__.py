"""High-level pipelines that orchestrate analyze -> generate -> compose.

Importing this package registers every runner in the registry, so the job
manager only needs to know a `kind` string.
"""

from . import canvas, music_video, single  # noqa: F401  (registers runners)
from .runner import RUNNERS, JobContext, Cancelled, get_runner  # noqa: F401
