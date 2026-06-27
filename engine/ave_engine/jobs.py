"""Single-worker job queue for all pipeline kinds.

Finished jobs are written to ``data/cache/job-history.json`` so the Library
tab still lists renders after the engine restarts.
"""

from __future__ import annotations

import queue
import threading
import uuid
from dataclasses import dataclass, field
from typing import Optional

from . import job_history
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
        self._history: list[dict] = []
        self._q: "queue.Queue[str]" = queue.Queue()
        self._lock = threading.Lock()
        self._load_history()
        self._worker = threading.Thread(target=self._run_loop, name="job-worker", daemon=True)
        self._worker.start()

    def _load_history(self) -> None:
        entries = job_history.load()
        discovered = job_history.discover_from_outputs()
        seen = {e.get("job_id") for e in entries}
        for d in discovered:
            if d.get("job_id") not in seen:
                entries.insert(0, d)
                seen.add(d.get("job_id"))
        if discovered:
            job_history.save(entries)
        self._history = entries

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
            job = self._jobs.get(job_id)
            if job:
                return job
        for entry in self._history:
            if entry.get("job_id") == job_id:
                return _job_from_history(entry)
        return None

    def list(self) -> list[dict]:
        with self._lock:
            live = [self._jobs[j].to_status() for j in reversed(self._order)]
        live_ids = {s["job_id"] for s in live}
        archived = [h for h in self._history if h.get("job_id") not in live_ids]
        return live + archived

    def cancel(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return False
            if job.status in ("queued", "running"):
                job.cancel = True
                if job.status == "queued":
                    job.status = "cancelled"
                    self._persist(job)
                return True
        return False

    def _persist(self, job: Job) -> None:
        if job.status not in ("done", "error", "cancelled"):
            return
        job_history.append(job.to_status())
        with self._lock:
            self._history = job_history.load()

    def _run_loop(self) -> None:
        while True:
            job_id = self._q.get()
            job = self.get(job_id)
            if job is None or job.cancel:
                if job and job.status == "cancelled":
                    self._persist(job)
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
        finally:
            self._persist(job)


def _job_from_history(entry: dict) -> Job:
    return Job(
        job_id=str(entry.get("job_id", "")),
        kind=str(entry.get("kind", "generate")),
        payload=entry.get("request") or {},
        label=str(entry.get("label", "")),
        status=str(entry.get("status", "done")),
        progress=float(entry.get("progress", 1.0)),
        step=int(entry.get("step", 0)),
        total_steps=int(entry.get("total_steps", 0)),
        message=str(entry.get("message", "")),
        output_path=entry.get("output_path"),
        error=entry.get("error"),
    )


_manager: Optional[JobManager] = None


def get_jobs() -> JobManager:
    global _manager
    if _manager is None:
        _manager = JobManager()
    return _manager
