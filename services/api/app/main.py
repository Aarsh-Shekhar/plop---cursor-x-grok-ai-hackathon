"""PLOP API — projects, scenes, reconstruction jobs, NL commands, Hive bridge."""
from __future__ import annotations

import asyncio
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI, File, Form, HTTPException, UploadFile  # noqa: E402
from fastapi.concurrency import run_in_threadpool  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import StreamingResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from . import commands, hive_bridge, identify, jobs, store  # noqa: E402

ALLOWED_UPLOAD_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}
MAX_UPLOAD_BYTES = 25 * 1024 * 1024

store.init()
app = FastAPI(title="PLOP API")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)
app.mount("/artifacts", StaticFiles(directory=store.ARTIFACTS_DIR), name="artifacts")


@app.get("/api/health")
def health():
    return {"ok": True}


# -- projects ---------------------------------------------------------------

class ProjectIn(BaseModel):
    name: str
    mode: str = "consumer"


@app.get("/api/projects")
def list_projects():
    return store.list_projects()


@app.post("/api/projects")
def create_project(body: ProjectIn):
    if body.mode not in ("consumer", "founder"):
        raise HTTPException(400, "mode must be consumer or founder")
    return store.create_project(body.name.strip()[:80] or "Untitled", body.mode)


@app.get("/api/projects/{project_id}")
def get_project(project_id: str):
    p = store.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    return p


# -- upload + reconstruction ------------------------------------------------

@app.post("/api/projects/{project_id}/media")
async def upload_media(project_id: str, image: UploadFile = File(...),
                       name: str = Form("Space"), mode: str = Form("")):
    project = store.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    if image.content_type not in ALLOWED_UPLOAD_TYPES:
        raise HTTPException(415, f"Unsupported media type {image.content_type}. "
                                 "Upload JPEG, PNG, WebP or HEIC.")
    data = await image.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File exceeds the 25 MB upload limit")
    scene_mode = mode if mode in ("consumer", "founder") else project["mode"]
    job = jobs.start_reconstruction(project_id, name.strip()[:80] or "Space", scene_mode, data)
    return job


@app.get("/api/reconstruction-jobs/{job_id}")
def get_job(job_id: str):
    job = jobs.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@app.get("/api/reconstruction-jobs/{job_id}/events")
def job_events(job_id: str):
    return StreamingResponse(jobs.subscribe(job_id), media_type="text/event-stream")


# -- scenes -----------------------------------------------------------------

@app.get("/api/scenes")
def list_scenes():
    return store.list_scenes()


@app.get("/api/scenes/{scene_id}")
def get_scene(scene_id: str):
    scene = store.get_scene(scene_id)
    if not scene:
        raise HTTPException(404, "Scene not found")
    return scene


class ScenePatch(BaseModel):
    objects: list[dict] | None = None
    name: str | None = None
    mode: str | None = None
    environment: dict | None = None
    scaleConfidence: str | None = None


@app.patch("/api/scenes/{scene_id}")
def patch_scene(scene_id: str, body: ScenePatch):
    scene = store.get_scene(scene_id)
    if not scene:
        raise HTTPException(404, "Scene not found")
    patch = body.model_dump(exclude_none=True)
    # objects are replaced wholesale (the client owns transform state);
    # ids must be preserved so history/undo stays consistent
    if "objects" in patch:
        old_ids = {o["id"] for o in scene["objects"]}
        new_ids = {o["id"] for o in patch["objects"]}
        if not new_ids.issubset(old_ids | {i for i in new_ids if i.startswith("obj_new_")}):
            raise HTTPException(400, "Unknown object ids in patch")
    scene.update(patch)
    store.save_scene(scene)
    return {"ok": True, "revision": scene.get("revision", 0)}


# -- natural language commands ---------------------------------------------

class CommandIn(BaseModel):
    text: str
    selectedObjectId: str | None = None


@app.post("/api/scenes/{scene_id}/commands")
async def scene_command(scene_id: str, body: CommandIn):
    scene = store.get_scene(scene_id)
    if not scene:
        raise HTTPException(404, "Scene not found")
    if not body.text.strip():
        raise HTTPException(400, "Empty command")
    try:
        return await run_in_threadpool(commands.parse, scene, body.text, body.selectedObjectId)
    except Exception as e:
        raise HTTPException(502, f"Command parsing failed: {e}")


# -- identification + shopping ---------------------------------------------

@app.post("/api/scenes/{scene_id}/objects/{object_id}/identify")
async def identify_endpoint(scene_id: str, object_id: str):
    scene = store.get_scene(scene_id)
    if not scene:
        raise HTTPException(404, "Scene not found")
    obj = next((o for o in scene["objects"] if o["id"] == object_id), None)
    if not obj:
        raise HTTPException(404, "Object not found")
    try:
        result = await run_in_threadpool(identify.identify_object, scene, obj)
    except Exception as e:
        raise HTTPException(502, f"Identification failed: {e}")
    obj.setdefault("semantic", {})["identified"] = result
    store.save_scene(scene)
    return result


class ShopIn(BaseModel):
    query: str
    context: str = ""


@app.post("/api/shop")
async def shop_endpoint(body: ShopIn):
    try:
        return await run_in_threadpool(identify.shop, body.query, body.context)
    except Exception as e:
        raise HTTPException(502, f"Shopping search failed: {e}")


# -- Hive bridge ------------------------------------------------------------

class HiveRunIn(BaseModel):
    prompt: str
    sceneId: str | None = None
    selectedObjectIds: list[str] = []


@app.post("/api/hive/runs")
async def create_hive_run(body: HiveRunIn):
    if not await hive_bridge.health():
        raise HTTPException(503, "Hive backend is not running (expected at "
                                 f"{hive_bridge.HIVE_API}). Start it with scripts/dev.sh.")
    scene = store.get_scene(body.sceneId) if body.sceneId else None
    try:
        return await hive_bridge.create_run(body.prompt, scene, body.selectedObjectIds)
    except Exception as e:
        raise HTTPException(502, f"Hive run creation failed: {e}")


@app.get("/api/hive/runs/{run_id}")
async def get_hive_run(run_id: str):
    try:
        return await hive_bridge.get_run(run_id)
    except Exception as e:
        raise HTTPException(502, f"Hive fetch failed: {e}")


@app.get("/api/hive/runs/{run_id}/jobs")
async def get_hive_jobs(run_id: str):
    try:
        return await hive_bridge.get_jobs(run_id)
    except Exception as e:
        raise HTTPException(502, f"Hive fetch failed: {e}")


@app.post("/api/hive/runs/{run_id}/extract-candidates")
async def hive_extract_candidates(run_id: str):
    """Structured product candidates parsed out of a finished Hive run."""
    try:
        hive_jobs = await hive_bridge.get_jobs(run_id)
    except Exception as e:
        raise HTTPException(502, f"Hive fetch failed: {e}")
    results = [j.get("draft_text") or j.get("summary") or "" for j in hive_jobs]
    try:
        return await run_in_threadpool(hive_bridge.extract_candidates, results)
    except Exception as e:
        raise HTTPException(502, f"Candidate extraction failed: {e}")


@app.get("/api/hive/health")
async def hive_health():
    return {"ok": await hive_bridge.health(), "ui": hive_bridge.HIVE_UI}
