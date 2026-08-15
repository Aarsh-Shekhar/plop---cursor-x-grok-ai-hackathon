"""File-backed store for projects, scenes and binary artifacts.

Layout (under services/api/data/):
    projects.json                  — list of projects
    scenes/<scene_id>.json         — full scene document
    artifacts/<scene_id>/...       — pngs (source, depth, cleaned, masks, cutouts)
"""
from __future__ import annotations

import json
import threading
import time
import uuid
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SCENES_DIR = DATA_DIR / "scenes"
ARTIFACTS_DIR = DATA_DIR / "artifacts"
PROJECTS_FILE = DATA_DIR / "projects.json"

_lock = threading.Lock()


def init() -> None:
    SCENES_DIR.mkdir(parents=True, exist_ok=True)
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    if not PROJECTS_FILE.exists():
        PROJECTS_FILE.write_text("[]")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


# -- projects ---------------------------------------------------------------

def list_projects() -> list[dict]:
    with _lock:
        return json.loads(PROJECTS_FILE.read_text())


def create_project(name: str, mode: str = "consumer") -> dict:
    project = {
        "id": new_id("proj"),
        "name": name,
        "mode": mode,
        "createdAt": time.time(),
        "sceneIds": [],
    }
    with _lock:
        projects = json.loads(PROJECTS_FILE.read_text())
        projects.append(project)
        PROJECTS_FILE.write_text(json.dumps(projects, indent=1))
    return project


def get_project(project_id: str) -> dict | None:
    return next((p for p in list_projects() if p["id"] == project_id), None)


def update_project(project_id: str, **fields) -> dict | None:
    with _lock:
        projects = json.loads(PROJECTS_FILE.read_text())
        for p in projects:
            if p["id"] == project_id:
                p.update(fields)
                PROJECTS_FILE.write_text(json.dumps(projects, indent=1))
                return p
    return None


def add_scene_to_project(project_id: str, scene_id: str) -> None:
    with _lock:
        projects = json.loads(PROJECTS_FILE.read_text())
        for p in projects:
            if p["id"] == project_id and scene_id not in p["sceneIds"]:
                p["sceneIds"].append(scene_id)
        PROJECTS_FILE.write_text(json.dumps(projects, indent=1))


# -- scenes -----------------------------------------------------------------

def save_scene(scene: dict) -> None:
    path = SCENES_DIR / f"{scene['id']}.json"
    with _lock:
        path.write_text(json.dumps(scene))


def get_scene(scene_id: str) -> dict | None:
    path = SCENES_DIR / f"{scene_id}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())


def list_scenes() -> list[dict]:
    out = []
    for p in sorted(SCENES_DIR.glob("*.json")):
        try:
            s = json.loads(p.read_text())
            out.append({k: s.get(k) for k in ("id", "projectId", "name", "mode", "status", "createdAt")})
        except json.JSONDecodeError:
            continue
    return out


# -- artifacts --------------------------------------------------------------

def artifact_dir(scene_id: str) -> Path:
    d = ARTIFACTS_DIR / scene_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def artifact_uri(scene_id: str, filename: str) -> str:
    """URL path the frontend can fetch (mounted at /artifacts)."""
    return f"/artifacts/{scene_id}/{filename}"
