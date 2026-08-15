"""Reconstruction job manager.

Jobs run in a thread pool (the CV pipeline is synchronous CPU work) and
publish stage events that clients consume over SSE. Job state survives page
refresh for as long as the backend process lives, matching the reliability
requirement; finished scenes are persisted to disk by the pipeline itself.
"""
from __future__ import annotations

import json
import queue
import threading
import time
import traceback

from . import reconstruct, store

_jobs: dict[str, dict] = {}
_subscribers: dict[str, list[queue.Queue]] = {}
_lock = threading.Lock()


def _publish(job_id: str, event: dict) -> None:
    with _lock:
        job = _jobs[job_id]
        job["events"].append(event)
        job.update(
            stage=event["stage"], detail=event["detail"], pct=event["pct"],
            updatedAt=time.time(),
        )
        subs = list(_subscribers.get(job_id, []))
    for q in subs:
        q.put(event)


def start_reconstruction(project_id: str, name: str, mode: str, image_bytes: bytes) -> dict:
    scene_id = store.new_id("scene")
    job_id = store.new_id("job")
    job = {
        "id": job_id,
        "sceneId": scene_id,
        "projectId": project_id,
        "status": "running",
        "stage": "queued",
        "detail": "Queued",
        "pct": 0,
        "events": [],
        "createdAt": time.time(),
        "updatedAt": time.time(),
        "error": None,
    }
    with _lock:
        _jobs[job_id] = job

    def on_progress(stage: str, detail: str, pct: int) -> None:
        _publish(job_id, {"stage": stage, "detail": detail, "pct": pct, "t": time.time()})

    def worker() -> None:
        try:
            reconstruct.run_pipeline(scene_id, project_id, name, mode, image_bytes, on_progress)
            store.add_scene_to_project(project_id, scene_id)
            with _lock:
                _jobs[job_id]["status"] = "completed"
        except Exception as e:  # surface real errors to the client, never hang
            traceback.print_exc()
            with _lock:
                _jobs[job_id]["status"] = "failed"
                _jobs[job_id]["error"] = str(e)
            _publish(job_id, {"stage": "failed", "detail": str(e), "pct": 100, "t": time.time()})

    threading.Thread(target=worker, daemon=True).start()
    return {k: v for k, v in job.items() if k != "events"}


def get_job(job_id: str) -> dict | None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return None
        return {k: v for k, v in job.items() if k != "events"}


def subscribe(job_id: str):
    """Generator of SSE-formatted strings: replays past events, then streams."""
    q: queue.Queue = queue.Queue()
    with _lock:
        job = _jobs.get(job_id)
        if job is None:
            yield f"data: {json.dumps({'stage': 'unknown', 'detail': 'Job not found', 'pct': 0})}\n\n"
            return
        past = list(job["events"])
        _subscribers.setdefault(job_id, []).append(q)
    try:
        for ev in past:
            yield f"data: {json.dumps(ev)}\n\n"
        if job["status"] in ("completed", "failed"):
            return
        while True:
            try:
                ev = q.get(timeout=120)
            except queue.Empty:
                yield ": keepalive\n\n"
                continue
            yield f"data: {json.dumps(ev)}\n\n"
            if ev["stage"] in ("ready", "failed"):
                return
    finally:
        with _lock:
            subs = _subscribers.get(job_id, [])
            if q in subs:
                subs.remove(q)
