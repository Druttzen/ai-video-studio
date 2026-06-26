"""Single-worker job queue for all pipeline kinds.

GPU work is serialized through one background worker thread (two diffusion jobs
at once on a consumer GPU just means two OOMs). Each job carries a ``kind`` that
selects a runner from :mod:`ave_engine.pipelines`, plus a free-form ``payload``.
Live progress is polled by the UI. State is in-memory (process lifetime), which
is fine for a desktop sidecar.
"""

from __future__ import annotations

import queue
import threading
import uuid
from dataclasses import dataclass, field
from typing import Optional

from .config import get_settings


@dataclass
class Job:
    job_id: str
    kind: str
    payload: dict
    label: str = ""
    status: str = "queued"        # queued | running | done | error | cancelled
    progress: float = 0.0
    step: int = 0
    total_steps: int = 0
    message: str = ""
    output_path: Optional[str] = None
    error: Optional[str] = None
    cancel: bool = field(default=False, repr=False)

    def to_status(self) -> dict:
        return {
            "job_id": self.job_id,
            "kind": self.kind,
            "label": self.label,
            "status": self.status,
            "progress": self.progress,
            "step": self.step,
            "total_steps": self.total_steps,
            "message": self.message,
            "output_path": self.output_path,
            "error": self.error,
            "request": self.payload,
        }


class JobManager:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._order: list[str] = []
        self._q: "queue.Queue[str]" = queue.Queue()
        self._lock = threading.Lock()
        self._worker = threading.Thread(target=self._run_loop, name="job-worker", daemon=True)
        self._worker.start()

    def submit(self, kind: str, payload: dict, label: str = "") -> Job:
        job = Job(
            job_id=uuid.uuid4().hex[:12],
            kind=kind,
            payload=payload,
            label=label,
            total_steps=int(payload.get("num_inference_steps", 0) or 0),
        )
        with self._lock:
            self._jobs[job.job_id] = job
            self._order.append(job.job_id)
        self._q.put(job.job_id)
        return job

    def get(self, job_id: str) -> Optional[Job]:
        with self._lock:
            return self._jobs.get(job_id)

    def list(self) -> list[dict]:
        with self._lock:
            return [self._jobs[j].to_status() for j in reversed(self._order)]

    def cancel(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return False
            if job.status in ("queued", "running"):
                job.cancel = True
                if job.status == "queued":
                    job.status = "cancelled"
                return True
        return False

    def _run_loop(self) -> None:
        while True:
            job_id = self._q.get()
            job = self.get(job_id)
            if job is None or job.cancel:
                if job:
                    job.status = "cancelled"
                continue
            self._execute(job)

    def _execute(self, job: Job) -> None:
        from .pipelines import Cancelled, JobContext, get_runner

        job.status = "running"
        job.message = "starting"
        try:
            runner = get_runner(job.kind)
            ctx = JobContext(job, get_settings())
            output_path = runner(job.payload, ctx)
            job.output_path = output_path
            job.progress = 1.0
            job.status = "done"
            job.message = "complete"
        except Cancelled:
            job.status = "cancelled"
            job.message = "cancelled by user"
        except Exception as exc:  # noqa: BLE001 - report to UI
            job.status = "error"
            job.error = str(exc)
            job.message = "failed"


_manager: Optional[JobManager] = None


def get_jobs() -> JobManager:
    global _manager
    if _manager is None:
        _manager = JobManager()
    return _manager
