"""Goal Mode: outcome-oriented planning pipeline.

    goal → structured objective (LLM: Grok when XAI_API_KEY is set, else
    Claude) → scene analysis (deterministic) → constraints (deterministic)
    → candidate layouts (constrained transformations) → validation
    (constraint engine) → optional Hive product research (real dimensions,
    fit-checked) → scoring (deterministic, exposed breakdown) → ranked
    options + a short LLM rationale that references only computed numbers.

The LLM never invents geometry, prices, or scores — it parses intent and
narrates results. Everything numeric comes from tools in this module.
"""
from __future__ import annotations

import sys
import threading
import time
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from providers import get_provider  # noqa: E402

from . import constraints as C  # noqa: E402
from . import identify, relations, store  # noqa: E402

GOAL_SCHEMA = {
    "type": "object",
    "properties": {
        "objective_summary": {"type": "string"},
        "goal_type": {"type": "string",
                      "enum": ["rearrange", "add_capacity", "declutter",
                               "upgrade_products", "optimize_cooling", "other"]},
        "budget_usd": {"type": ["number", "null"]},
        "min_walkway_cm": {"type": ["number", "null"]},
        "keep_clear": {"type": "array", "items": {"type": "string"},
                       "description": "labels that must stay unobstructed, e.g. window, door"},
        "needs_products": {"type": "boolean"},
        "product_query": {"type": ["string", "null"],
                          "description": "what to research online, if needed"},
        "style_keywords": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["objective_summary", "goal_type", "budget_usd", "min_walkway_cm",
                 "keep_clear", "needs_products", "product_query", "style_keywords"],
    "additionalProperties": False,
}

_jobs: dict[str, dict] = {}
_lock = threading.Lock()


def start(scene_id: str, goal: str) -> dict:
    job_id = store.new_id("goal")
    job = {"id": job_id, "sceneId": scene_id, "goal": goal, "status": "running",
           "steps": [], "result": None, "error": None, "createdAt": time.time()}
    with _lock:
        _jobs[job_id] = job
    threading.Thread(target=_run, args=(job_id,), daemon=True).start()
    return {"id": job_id, "status": "running"}


def get(job_id: str) -> dict | None:
    with _lock:
        j = _jobs.get(job_id)
        return dict(j) if j else None


def _step(job_id: str, text: str) -> None:
    with _lock:
        _jobs[job_id]["steps"].append({"t": time.time(), "text": text})


def _run(job_id: str) -> None:
    job = _jobs[job_id]
    try:
        scene = store.get_scene(job["sceneId"])
        if not scene:
            raise RuntimeError("scene not found")
        result = _pipeline(job_id, scene, job["goal"])
        with _lock:
            job["result"] = result
            job["status"] = "completed"
    except Exception as e:
        traceback.print_exc()
        with _lock:
            job["error"] = str(e)
            job["status"] = "failed"


def _pipeline(job_id: str, scene: dict, goal: str) -> dict:
    provider = get_provider()
    founder = scene.get("mode") == "founder"

    # 1. structured objective ------------------------------------------------
    _step(job_id, "Parsing goal into a structured objective…")
    objs = [o for o in scene["objects"] if not o["state"]["hidden"]]
    names = ", ".join(o["name"] for o in objs[:20])
    parsed = provider.generate_structured(
        f"Scene mode: {scene['mode']}. Objects present: {names}.\n"
        f"User goal: {goal}\n"
        "Extract the structured objective. min_walkway_cm only if the user "
        "specified one (convert inches to cm). needs_products=true only when "
        "the goal requires buying/researching real products.",
        GOAL_SCHEMA, max_tokens=2500,
    )
    _step(job_id, f"Objective: {parsed['objective_summary']}")

    # 2. scene analysis ------------------------------------------------------
    rels = relations.derive_relations(scene)
    floor_y = scene["environment"]["floorY"]
    movable = [o for o in objs
               if C.is_floor_standing(o, floor_y) and not o["state"]["locked"]
               and o["category"] not in ("enclosure",)
               # structural / oversized pieces are not furniture to rearrange
               and max(o["dimensions"]["width"], o["dimensions"]["depth"]) < 3.5]
    room = C.room_bounds(scene)
    _step(job_id, f"Analyzed {len(objs)} objects, {len(rels)} spatial relations; "
                  f"room ≈ {room.w:.1f} × {room.d:.1f} m; {len(movable)} movable")

    # 3. constraints ---------------------------------------------------------
    min_walkway = (parsed.get("min_walkway_cm") or 76) / 100
    keep_clear = [k.lower() for k in (parsed.get("keep_clear") or [])] or ["window", "door"]
    _step(job_id, f"Constraints: walkway ≥ {min_walkway * 100:.0f} cm; "
                  f"keep clear: {', '.join(keep_clear)}"
                  + (f"; budget ${parsed['budget_usd']:.0f}" if parsed.get("budget_usd") else ""))

    # 4. candidates ----------------------------------------------------------
    _step(job_id, "Generating candidate layouts (constrained transformations)…")
    if founder:
        cands = _founder_candidates(scene, movable)
    else:
        cands = _consumer_candidates(scene, movable, room)
    _step(job_id, f"Generated {len(cands)} candidates")

    # 5. validation ----------------------------------------------------------
    # Baseline faults that already exist in the captured scene (objects that
    # genuinely touch in the model) must not disqualify alternatives — only
    # NEWLY INTRODUCED hard failures do.
    def run_checks(transforms):
        return (C.check_enclosure(scene, transforms) if founder
                else C.check_layout(scene, transforms, min_walkway, keep_clear))

    def hard_faults(checks):
        out = set()
        for c in checks:
            if c["hard"] and not c["passed"]:
                for part in c["detail"].split(";"):
                    out.add(f"{c['label']}:{part.strip()}")
        return out

    baseline_faults = hard_faults(run_checks({}))
    options = []
    rejected = 0
    for label, transforms, note in cands:
        is_current = label.startswith("current")
        checks = run_checks(transforms)
        new_faults = hard_faults(checks) - baseline_faults
        for c in checks:
            if c["hard"] and not c["passed"] and not new_faults:
                c["detail"] += " (pre-existing in capture, ignored)"
                c["preexisting"] = True
        if new_faults and not is_current:
            rejected += 1
            continue
        walkway = next((float(c["detail"].split("≈")[1].split("cm")[0]) / 100
                        for c in checks if "lane" in c.get("detail", "")), None)
        options.append({"label": label, "note": note, "transforms": transforms,
                        "checks": checks, "walkway": walkway})
    _step(job_id, f"Validated candidates: {len(options)} pass, {rejected} rejected "
                  f"(collision / out of bounds)")

    # 6. product research (Hive as a tool) -----------------------------------
    products = []
    if parsed.get("needs_products") and parsed.get("product_query"):
        stores_ = ([("Newegg", "newegg.com"), ("Amazon", "amazon.com"), ("Best Buy", "bestbuy.com")]
                   if founder else
                   [("Amazon", "amazon.com"), ("IKEA", "ikea.com"), ("Wayfair", "wayfair.com")])
        budget_note = f" under ${parsed['budget_usd']:.0f}" if parsed.get("budget_usd") else ""
        _step(job_id, f"Hive researching: {parsed['product_query']}{budget_note} "
                      f"across {len(stores_)} stores…")
        for name, domain in stores_:
            try:
                r = identify.scan_retailer(parsed["product_query"] + budget_note, name, domain)
            except Exception as e:
                _step(job_id, f"{name} worker failed: {e}")
                continue
            if not r.get("found"):
                continue
            dims = (r.get("width_cm"), r.get("height_cm"), r.get("depth_cm"))
            fit = None
            if dims[0]:
                dims_m = ((dims[0] or 60) / 100, (dims[1] or 60) / 100, (dims[2] or 40) / 100)
                pos = [room.cx, scene["environment"]["floorY"] + dims_m[1] / 2, room.cz]
                fit = C.fit_report(scene, dims_m, pos)
            products.append({**r, "retailer": name, "fit": fit})
        found_dims = sum(1 for p in products if p.get("width_cm"))
        _step(job_id, f"Hive found {len(products)} products ({found_dims} with listed "
                      f"dimensions, fit-checked against the scene)")

    # 7. scoring -------------------------------------------------------------
    budget = parsed.get("budget_usd")
    best_price = min((p["price_usd"] for p in products if p.get("price_usd")), default=None)
    style_words = [w.lower() for w in parsed.get("style_keywords") or []]
    scored = []
    for opt in options:
        pref_hits = sum(1 for w in style_words if w in (opt["note"] or "").lower())
        carried = sum(1 for c in opt["checks"]
                      if c.get("hard") and not c["passed"])
        s = C.score_layout(opt["checks"], opt.get("walkway"), best_price, budget,
                           pref_hits, carried_faults=carried)
        scored.append({**opt, "score": s["total"], "breakdown": s["breakdown"]})
    scored.sort(key=lambda o: -o["score"])
    for i, o in enumerate(scored):
        o["id"] = f"option_{chr(65 + i)}"
        o["label"] = f"Option {chr(65 + i)} — {o['label']}"
    _step(job_id, "Scored options: " + ", ".join(f"{o['id'][-1]}={o['score']}" for o in scored))

    # 8. recommendation narrative (no new numbers) ---------------------------
    rationale = ""
    if scored:
        try:
            rationale = provider.reason(
                f"Goal: {parsed['objective_summary']}\n"
                + "\n".join(f"{o['label']}: score {o['score']}, checks: "
                            + "; ".join(f"{c['label']}={'PASS' if c['passed'] else 'FAIL'}"
                                        for c in o["checks"])
                            for o in scored[:3])
                + "\nIn 2-3 sentences, explain why the top option wins. Reference only "
                  "the scores and checks above — do not invent any numbers.",
                max_tokens=2200,
            ).strip()
        except Exception:
            rationale = f"{scored[0]['label']} satisfies the most constraints at the highest score."
    _step(job_id, "Recommendation ready")

    return {
        "objective": parsed,
        "options": scored,
        "products": products,
        "recommendedId": scored[0]["id"] if scored else None,
        "rationale": rationale,
        "analysis": {"objects": len(objs), "relations": len(rels),
                     "movable": len(movable), "rejected": rejected,
                     "roomW": round(room.w, 2), "roomD": round(room.d, 2)},
    }


# ---- candidate generators (deterministic transformations) -----------------

def _declash(scene, transforms, obj, target, room, axis="x"):
    """Slide `target` along `axis` until obj no longer collides with anything
    (other objects at their current-or-planned positions). Returns a valid
    position or None."""
    objs = [o for o in scene["objects"] if not o["state"]["hidden"] and o["id"] != obj["id"]]
    others = [C.obj_aabb(o, transforms.get(o["id"])) for o in objs
              if C.is_floor_standing(o, scene["environment"]["floorY"])]
    step = 0.18
    for k in range(24):
        offset = (k + 1) // 2 * step * (1 if k % 2 == 0 else -1)
        pos = list(target)
        if axis == "x":
            pos[0] += offset
        else:
            pos[2] += offset
        cand = C.obj_aabb(obj, pos)
        if (cand.min_x < room.min_x or cand.max_x > room.max_x or
                cand.min_z < room.min_z or cand.max_z > room.max_z):
            continue
        if not any(cand.intersects(b, margin=0.03) for b in others):
            return pos
    return None


def _consumer_candidates(scene, movable, room):
    """Three layout strategies over the movable furniture."""
    floor = scene["environment"]["floorY"]
    big = sorted(movable, key=lambda o: -(o["dimensions"]["width"] * o["dimensions"]["depth"]))

    def y_of(o):
        return floor + o["dimensions"]["height"] / 2 if o["perception"].get("floorStanding", True) \
            else o["transform"]["position"][1]

    cands = [("current layout", {}, "existing arrangement, evaluated against the same constraints")]

    # A: perimeter — big pieces against the far wall, center open
    t: dict[str, list[float]] = {}
    z_wall = room.min_z + 0.55
    x = room.min_x + 0.6
    for o in big[:4]:
        w = o["dimensions"]["width"]
        target = [min(x + w / 2, room.max_x - w / 2 - 0.1), y_of(o), z_wall]
        pos = _declash(scene, t, o, target, room, "x")
        if pos:
            t[o["id"]] = pos
            x = pos[0] + w / 2 + 0.35
    cands.append(("perimeter layout", t, "large pieces along the far wall, open center"))

    # B: rotated axis — arrange along the side wall instead
    t2: dict[str, list[float]] = {}
    x_wall = room.max_x - 0.6
    z = room.min_z + 0.7
    for o in big[:4]:
        d = o["dimensions"]["depth"]
        target = [x_wall, y_of(o), min(z + d / 2 + 0.2, room.max_z - 0.4)]
        pos = _declash(scene, t2, o, target, room, "z")
        if pos:
            t2[o["id"]] = pos
            z = pos[2] + d / 2 + 0.4
    cands.append(("side-wall layout", t2, "furniture run along the right wall"))

    # C: compact cluster — everything pulled toward one corner, max free area
    t3: dict[str, list[float]] = {}
    cx, cz = room.min_x + room.w * 0.3, room.min_z + room.d * 0.3
    for i, o in enumerate(big[:5]):
        target = [cx + (i % 2) * (o["dimensions"]["width"] + 0.3),
                  y_of(o),
                  cz + (i // 2) * (o["dimensions"]["depth"] + 0.4)]
        pos = _declash(scene, t3, o, target, room, "x" if i % 2 else "z")
        if pos:
            t3[o["id"]] = pos
    cands.append(("compact cluster", t3, "furniture clustered to maximize contiguous free space"))
    return cands


def _founder_candidates(scene, movable):
    """Hardware variants: stock, spaced components, cooling-priority."""
    cands = [("current arrangement", {}, "components as mounted")]

    # spaced: pull heat sources apart slightly along z
    t: dict[str, list[float]] = {}
    for o in movable:
        role = (o.get("technical") or {}).get("thermal_role")
        if role == "heat-source":
            p = o["transform"]["position"]
            t[o["id"]] = [p[0], p[1], p[2] + (0.02 if p[2] >= 0 else -0.02)]
    if t:
        cands.append(("spaced heat sources", t, "heat-generating parts separated for airflow"))

    # cooling-priority: nudge cooling toward the hottest component
    hot = next((o for o in movable
                if (o.get("technical") or {}).get("thermal_role") == "heat-source"), None)
    t2: dict[str, list[float]] = {}
    if hot:
        hp = hot["transform"]["position"]
        for o in movable:
            if o["category"] == "cooling" and "fan" in o["label"]:
                p = o["transform"]["position"]
                t2[o["id"]] = [p[0], (p[1] + hp[1]) / 2, p[2]]
        if t2:
            cands.append(("cooling repositioned", t2,
                          "intake fans aligned with the hottest component"))
    return cands
