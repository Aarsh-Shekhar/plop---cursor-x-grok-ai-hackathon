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


GSUITE_HINTS = ("gmail", "email", "e-mail", "calendar", "google doc", "google sheet",
                "spreadsheet", "google slide", "presentation", "google form", "google drive")

MAX_WORKERS = 9

SWARM_SCHEMA = {
    "type": "object",
    "properties": {
        "workers": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string",
                             "description": "Short worker label, e.g. 'Amazon scan' or 'Price analysis'"},
                    "instruction": {"type": "string",
                                    "description": "Self-contained research instruction for this one worker"},
                },
                "required": ["name", "instruction"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["workers"],
    "additionalProperties": False,
}

SWARM_SYSTEM = """You decompose a user's request into parallel worker tasks for an
agent swarm. Each worker is independent and does web research on ONE angle.

For product/shopping requests: one worker PER RETAILER/MARKETPLACE (pick the most
relevant of: Amazon, eBay, Wayfair, IKEA, Target, Walmart, Etsy, Home Depot,
Facebook Marketplace, or domain-specific vendors like Newegg/Digi-Key/McMaster for
hardware), each instructed to find specific in-stock products on that retailer with
exact prices, dimensions and URLs — plus ONE worker doing overall price/value
analysis across the market.

For general research: 4-7 workers each covering a distinct angle (specs, reviews,
alternatives, pricing, compatibility, availability).

Each instruction must be fully self-contained (the worker sees nothing else),
mention its retailer/angle explicitly, and demand concrete items with prices,
dimensions and URLs — never generic category advice. 5-9 workers total."""


def decompose_swarm(prompt: str, context: str) -> list[dict]:
    """One @hive request -> many per-source worker tasks (one hexagon each)."""
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from providers import get_provider

    try:
        result = get_provider().generate_structured(
            f"User request: {prompt}\n\nScene context (include the relevant "
            f"constraints in every worker's instruction):\n{context}",
            SWARM_SCHEMA, system=SWARM_SYSTEM, max_tokens=2500,
        )
        workers = result.get("workers", [])[:MAX_WORKERS]
    except Exception:
        workers = []
    if len(workers) < 2:
        # decomposition failed — fall back to a fixed retailer fan-out so the
        # swarm still swarms
        retailers = ["Amazon", "eBay", "Wayfair", "Target", "Walmart", "Etsy"]
        workers = [{
            "name": f"{r} scan",
            "instruction": f"Search {r} specifically for: {prompt}. Report concrete "
                           f"in-stock products with exact prices, dimensions and URLs. "
                           f"{context}",
        } for r in retailers] + [{
            "name": "Price analysis",
            "instruction": f"Research typical market pricing and what constitutes good "
                           f"value for: {prompt}. {context}",
        }]
    return workers


async def create_run(prompt: str, scene: dict | None, selected_ids: list[str]) -> dict:
    context = serialize_scene_context(scene, selected_ids) if scene is not None else ""
    lower = prompt.lower()
    if any(h in lower for h in GSUITE_HINTS):
        # GSuite-flavored tasks go through Hive's own router untouched (they
        # need its Gmail/Docs pipelines and OAuth)
        tasks = [{"description": f"{prompt}\n\n{context}".strip(),
                  "pipeline_type": "", "url": "", "params": {}}]
    else:
        import asyncio
        workers = await asyncio.to_thread(decompose_swarm, prompt, context)
        # pipeline_type "research" pins Hive's DuckDuckGo pipeline, which runs
        # without Browserbase/OAuth; each task becomes its own job/hexagon
        tasks = [{
            "description": f"[{w['name']}] {w['instruction']}",
            "pipeline_type": "research", "url": "", "params": {},
        } for w in workers]
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(f"{HIVE_API}/api/runs", json={"tasks": tasks})
        r.raise_for_status()
        run = r.json()
    return {
        "run": run,
        "workerCount": len(tasks),
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
