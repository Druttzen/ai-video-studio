"""Pipeline runner registry + shared job context.

A *runner* is ``Callable[[dict, JobContext], str]`` that does the work for one
job kind and returns the output file path. The :class:`JobContext` gives runners
a single, cancellation-aware way to report progress, including mapping a model's
per-step sampling progress into a sub-range of the overall job.
"""

from __future__ import annotations

from typing import Callable, Optional


class Cancelled(Exception):
    """Raised inside a runner when the user cancels the job."""


class JobContext:
    def __init__(self, job, settings) -> None:
        self.job = job
        self.settings = settings

    def check_cancel(self) -> None:
        if self.job.cancel:
            raise Cancelled()

    def progress(self, frac: float, message: Optional[str] = None) -> None:
        self.check_cancel()
        self.job.progress = max(0.0, min(1.0, frac))
        if message is not None:
            self.job.message = message

    def sampling_cb(self, lo: float, hi: float, message: str) -> Callable[[int, int], None]:
        """Return a (step, total) callback that maps sampling into [lo, hi]."""

        def _cb(step: int, total: int) -> None:
            self.check_cancel()
            self.job.step = step
            self.job.total_steps = total
            frac = lo + (hi - lo) * (step / max(total, 1))
            self.job.progress = max(0.0, min(1.0, frac))
            self.job.message = f"{message} ({step}/{total})"

        return _cb


Runner = Callable[[dict, JobContext], str]
RUNNERS: dict[str, Runner] = {}


def register(kind: str) -> Callable[[Runner], Runner]:
    def deco(fn: Runner) -> Runner:
        RUNNERS[kind] = fn
        return fn

    return deco


def get_runner(kind: str) -> Runner:
    try:
        return RUNNERS[kind]
    except KeyError as exc:
        raise KeyError(f"Unknown job kind: {kind!r}") from exc
