"""Bridge to the vendored Hive agent service (vendor/hive).

PLOP serializes only the semantically relevant scene context (never raw
geometry) into a Hive generic task, creates a run through Hive's own
/api/runs, and hands the user Hive's original UI focused on that run.
Hive's job/approval/SSE architecture is used as-is.
"""
from __future__ import annotations

import os

import httpx

HIVE_API = os.environ.get("HIVE_BACKEND_URL", "http://localhost:8000")
HIVE_UI = os.environ.get("HIVE_FRONTEND_URL", "http://localhost:3000")


def serialize_scene_context(scene: dict, selected_ids: list[str]) -> str:
    """Compact, human/agent-readable description of the scene + selection."""
    lines = [
        f"PLOP scene context — mode: {scene['mode']}, units: meters "
        f"(scale is {scene.get('scaleConfidence', 'inferred')}).",
    ]
    sel = [o for o in scene["objects"] if o["id"] in selected_ids]
    others = [o for o in scene["objects"] if o["id"] not in selected_ids and not o["state"]["hidden"]]
    for o in sel:
        d = o["dimensions"]
        colors = ", ".join(o["appearance"].get("dominantColors", [])[:3])
        sem = o.get("semantic", {}).get("identified") or {}
        name = sem.get("product_name") or sem.get("component_name") or o["name"]
        lines.append(
            f"SELECTED OBJECT: {name} ({o['category']}) — approx "
            f"{d['width']}m W x {d['height']}m H x {d['depth']}m D "
            f"(dimensions are {d['source']}); dominant colors: {colors}."
        )
    if others:
        lines.append("Other objects in the scene: " +
                     ", ".join(f"{o['name']} ({o['dimensions']['width']}x{o['dimensions']['height']}m)"
                               for o in others[:12]) + ".")
    return "\n".join(lines)


async def create_run(prompt: str, scene: dict | None, selected_ids: list[str]) -> dict:
    description = prompt
    if scene is not None:
        description = f"{prompt}\n\n{serialize_scene_context(scene, selected_ids)}"
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(f"{HIVE_API}/api/runs", json={
            "tasks": [{"description": description, "pipeline_type": "", "url": "", "params": {}}],
        })
        r.raise_for_status()
        run = r.json()
    return {
        "run": run,
        "hiveUrl": f"{HIVE_UI}/?run={run['id']}",
    }


async def get_run(run_id: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(f"{HIVE_API}/api/runs/{run_id}")
        r.raise_for_status()
        return r.json()


async def get_jobs(run_id: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(f"{HIVE_API}/api/runs/{run_id}/jobs")
        r.raise_for_status()
        return r.json()


CANDIDATE_SCHEMA = {
    "type": "object",
    "properties": {
        "candidates": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "price_usd": {"type": ["number", "null"]},
                    "url": {"type": ["string", "null"]},
                    "source": {"type": ["string", "null"]},
                    "width_cm": {"type": ["number", "null"]},
                    "height_cm": {"type": ["number", "null"]},
                    "depth_cm": {"type": ["number", "null"]},
                    "why": {"type": "string"},
                },
                "required": ["title", "price_usd", "url", "source",
                             "width_cm", "height_cm", "depth_cm", "why"],
                "additionalProperties": False,
            },
        },
        "summary": {"type": "string"},
    },
    "required": ["candidates", "summary"],
    "additionalProperties": False,
}


def extract_candidates(job_results: list[str]) -> dict:
    """Turn Hive's free-text research reports into structured, previewable
    product candidates via the provider abstraction."""
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from providers import get_provider

    corpus = "\n\n---\n\n".join(r for r in job_results if r)[:24000]
    if not corpus.strip():
        return {"candidates": [], "summary": "Hive returned no result text yet."}
    return get_provider().generate_structured(
        "Below are research reports produced by autonomous agents. Extract every "
        "concrete product/component candidate mentioned (name, price, retailer/source, "
        "URL, dimensions in cm when stated). Use null when a field is not stated — "
        "never invent prices or dimensions. Then give a one-paragraph summary.\n\n"
        + corpus,
        CANDIDATE_SCHEMA, max_tokens=4000,
    )


async def health() -> bool:
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            r = await client.get(f"{HIVE_API}/api/health")
            return r.status_code == 200
    except Exception:
        return False
