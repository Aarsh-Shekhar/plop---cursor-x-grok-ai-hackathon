"""Deterministic constraint engine — real geometry math, no LLM.

Every check returns {label, passed, detail, hard}. Hard failures disqualify a
candidate layout; soft failures only cost score. All units are meters.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class AABB:
    cx: float; cy: float; cz: float
    w: float; h: float; d: float

    @property
    def min_x(self): return self.cx - self.w / 2
    @property
    def max_x(self): return self.cx + self.w / 2
    @property
    def min_y(self): return self.cy - self.h / 2
    @property
    def max_y(self): return self.cy + self.h / 2
    @property
    def min_z(self): return self.cz - self.d / 2
    @property
    def max_z(self): return self.cz + self.d / 2

    def intersects(self, o: "AABB", margin: float = 0.0) -> bool:
        return (self.min_x < o.max_x + margin and self.max_x > o.min_x - margin and
                self.min_y < o.max_y + margin and self.max_y > o.min_y - margin and
                self.min_z < o.max_z + margin and self.max_z > o.min_z - margin)

    def clearance_to(self, o: "AABB") -> float:
        """Smallest axis gap between two boxes (negative when overlapping)."""
        dx = max(self.min_x - o.max_x, o.min_x - self.max_x)
        dz = max(self.min_z - o.max_z, o.min_z - self.max_z)
        return max(dx, dz)


def obj_aabb(obj: dict, position: list[float] | None = None) -> AABB:
    p = position or obj["transform"]["position"]
    s = obj["transform"].get("scale", [1, 1, 1])
    d = obj["dimensions"]
    return AABB(p[0], p[1], p[2], d["width"] * s[0], d["height"] * s[1], d["depth"] * s[2])


WALL_CATEGORIES = {"decor", "textile"}          # wall art, curtains — skip some checks
STATIC_LABELS = ("window", "door", "curtain", "blind", "radiator", "wall", "picture",
                 "artwork", "print", "frame")


def is_floor_standing(obj: dict, floor_y: float | None = None) -> bool:
    if any(k in obj["label"] for k in STATIC_LABELS):
        return False
    if not bool(obj.get("perception", {}).get("floorStanding", True)):
        return False
    if floor_y is not None:
        base = obj["transform"]["position"][1] - obj["dimensions"]["height"] / 2
        return abs(base - floor_y) < 0.4
    return True


def room_bounds(scene: dict) -> AABB:
    """Room extent from object footprints, padded 0.4m. Outlier objects
    (structural frames spanning the model, stray positions) are trimmed via
    median distance so one bad box can't inflate the room."""
    objs = [o for o in scene["objects"] if not o["state"]["hidden"]]
    if not objs:
        return AABB(0, 0, 0, 6, 3, 6)
    boxes = [obj_aabb(o) for o in objs
             if max(obj_aabb(o).w, obj_aabb(o).d) < 6.0]
    if not boxes:
        boxes = [obj_aabb(o) for o in objs]
    import statistics
    mx = statistics.median(b.cx for b in boxes)
    mz = statistics.median(b.cz for b in boxes)
    dists = sorted(abs(b.cx - mx) + abs(b.cz - mz) for b in boxes)
    cutoff = max(4.0, 3 * dists[len(dists) // 2] + 1.0)
    kept = [b for b in boxes if abs(b.cx - mx) + abs(b.cz - mz) <= cutoff]
    boxes = kept or boxes
    min_x = min(b.min_x for b in boxes) - 0.4
    max_x = max(b.max_x for b in boxes) + 0.4
    min_z = min(b.min_z for b in boxes) - 0.4
    max_z = max(b.max_z for b in boxes) + 0.4
    floor = scene.get("environment", {}).get("floorY", 0)
    return AABB((min_x + max_x) / 2, floor + 1.5, (min_z + max_z) / 2,
                max_x - min_x, 3.0, max_z - min_z)


def check_layout(scene: dict, overrides: dict[str, list[float]] | None = None,
                 min_walkway_m: float = 0.76, keep_clear: list[str] | None = None) -> list[dict]:
    """Run all consumer checks against a (possibly hypothetical) layout.

    overrides: objectId -> new position. keep_clear: labels that must not be
    blocked (e.g. 'window', 'door').
    """
    overrides = overrides or {}
    keep_clear = keep_clear or ["window", "door"]
    objs = [o for o in scene["objects"] if not o["state"]["hidden"]]
    room = room_bounds(scene)
    floor = scene.get("environment", {}).get("floorY", 0)
    boxes = {o["id"]: obj_aabb(o, overrides.get(o["id"])) for o in objs}
    checks: list[dict] = []

    # 1. collisions among floor-standing furniture
    floor_objs = [o for o in objs
                  if is_floor_standing(o, floor) and o["category"] not in WALL_CATEGORIES]
    collisions = []
    for i, a in enumerate(floor_objs):
        for b in floor_objs[i + 1:]:
            if boxes[a["id"]].intersects(boxes[b["id"]], margin=-0.02):
                collisions.append(f"{a['name']} ↔ {b['name']}")
    checks.append({
        "label": "No collisions", "passed": not collisions, "hard": True,
        "detail": "; ".join(collisions[:3]) if collisions else "all clear",
    })

    # 2. containment within room bounds
    outside = [o["name"] for o in floor_objs
               if boxes[o["id"]].min_x < room.min_x - 0.05 or boxes[o["id"]].max_x > room.max_x + 0.05
               or boxes[o["id"]].min_z < room.min_z - 0.05 or boxes[o["id"]].max_z > room.max_z + 0.05]
    checks.append({
        "label": "Inside room bounds", "passed": not outside, "hard": True,
        "detail": ", ".join(outside[:3]) if outside else "all inside",
    })

    # 3. floor support
    floating = [o["name"] for o in floor_objs
                if abs(boxes[o["id"]].min_y - floor) > 0.25]
    checks.append({
        "label": "Floor support", "passed": not floating, "hard": False,
        "detail": ", ".join(floating[:3]) + " not resting on floor" if floating else "grounded",
    })

    # 4. walkway: widest clear lane across the room (sampled center strips)
    walkway = _max_clear_lane(room, [boxes[o["id"]] for o in floor_objs])
    checks.append({
        "label": f"Walkway ≥ {min_walkway_m * 100:.0f} cm",
        "passed": walkway >= min_walkway_m, "hard": False,
        "detail": f"widest clear lane ≈ {walkway * 100:.0f} cm",
    })

    # 5. keep-clear zones (windows/doors): nothing tall directly in front
    for zone_label in keep_clear:
        zones = [o for o in objs if zone_label in o["label"]]
        for zone in zones:
            zb = obj_aabb(zone)
            blockers = []
            for o in floor_objs:
                b = boxes[o["id"]]
                if b.max_y - floor > 1.0 and b.intersects(
                        AABB(zb.cx, zb.cy, zb.cz, zb.w + 0.3, zb.h, zb.d + 0.9)):
                    blockers.append(o["name"])
            checks.append({
                "label": f"{zone['name']} unobstructed",
                "passed": not blockers, "hard": False,
                "detail": ", ".join(blockers[:2]) + " in front" if blockers else "clear",
            })
    return checks


def _max_clear_lane(room: AABB, boxes: list[AABB]) -> float:
    """Widest clear straight lane along x or z (coarse 1D sweep)."""
    best = 0.0
    for axis in ("x", "z"):
        lo = room.min_x if axis == "x" else room.min_z
        hi = room.max_x if axis == "x" else room.max_z
        spans = sorted(
            ((b.min_x, b.max_x) if axis == "x" else (b.min_z, b.max_z)) for b in boxes)
        cursor = lo
        for s, e in spans:
            if s > cursor:
                best = max(best, s - cursor)
            cursor = max(cursor, e)
        best = max(best, hi - cursor)
    return best


def fit_report(scene: dict, dims_m: tuple[float, float, float],
               position: list[float]) -> dict:
    """Would a product of these real dimensions fit at this position?"""
    objs = [o for o in scene["objects"] if not o["state"]["hidden"]]
    cand = AABB(position[0], position[1], position[2], *dims_m)
    room = room_bounds(scene)
    worst = None
    for o in objs:
        if not is_floor_standing(o):
            continue
        c = cand.clearance_to(obj_aabb(o))
        if worst is None or c < worst[1]:
            worst = (o["name"], c)
    in_room = (cand.min_x >= room.min_x and cand.max_x <= room.max_x and
               cand.min_z >= room.min_z and cand.max_z <= room.max_z)
    fits = in_room and (worst is None or worst[1] >= 0)
    return {
        "fits": fits,
        "clearance_cm": round(worst[1] * 100, 1) if worst else None,
        "nearest": worst[0] if worst else None,
        "in_room": in_room,
    }


# ---- founder checks -------------------------------------------------------

def check_enclosure(scene: dict, overrides: dict[str, list[float]] | None = None) -> list[dict]:
    """PC/hardware checks: enclosure containment, fan obstruction, GPU fit."""
    overrides = overrides or {}
    objs = [o for o in scene["objects"] if not o["state"]["hidden"]]
    case = next((o for o in objs if o["category"] == "enclosure"), None)
    checks: list[dict] = []
    boxes = {o["id"]: obj_aabb(o, overrides.get(o["id"])) for o in objs}
    if case:
        cb = boxes[case["id"]]
        inner = AABB(cb.cx, cb.cy, cb.cz, cb.w - 0.01, cb.h - 0.01, cb.d - 0.01)
        outside = [o["name"] for o in objs
                   if o["id"] != case["id"] and o["category"] != "enclosure"
                   and not inner.intersects(boxes[o["id"]])]
        escaped = [o["name"] for o in objs
                   if o["id"] != case["id"] and (
                       boxes[o["id"]].max_x > inner.max_x + 0.02 or
                       boxes[o["id"]].min_x < inner.min_x - 0.02 or
                       boxes[o["id"]].max_y > inner.max_y + 0.02 or
                       boxes[o["id"]].min_y < inner.min_y - 0.02)]
        checks.append({
            "label": "Components inside enclosure", "passed": not escaped, "hard": True,
            "detail": ", ".join(escaped[:3]) + " outside case" if escaped else "all contained",
        })
        del outside
    # component collisions (small margin)
    comp = [o for o in objs if o["category"] in ("compute", "cooling", "power", "storage")]
    hits = []
    for i, a in enumerate(comp):
        for b in comp[i + 1:]:
            if boxes[a["id"]].intersects(boxes[b["id"]], margin=-0.004):
                hits.append(f"{a['name']} ↔ {b['name']}")
    checks.append({
        "label": "Component clearance", "passed": not hits, "hard": True,
        "detail": "; ".join(hits[:3]) if hits else "no interference",
    })
    # fan obstruction: something big within 3cm in front of a cooling fan face
    fans = [o for o in objs if o["category"] == "cooling" and "fan" in o["label"]]
    obstructed = []
    for f in fans:
        fb = boxes[f["id"]]
        zone = AABB(fb.cx, fb.cy, fb.cz, fb.w + 0.02, fb.h + 0.02, fb.d + 0.06)
        for o in comp:
            if o["id"] == f["id"] or "fan" in o["label"]:
                continue
            if zone.intersects(boxes[o["id"]]):
                gap = fb.clearance_to(boxes[o["id"]])
                if gap < 0.015:
                    obstructed.append(f"{f['name']} by {o['name']}")
    checks.append({
        "label": "Fan intake/exhaust clear", "passed": not obstructed, "hard": False,
        "detail": "; ".join(obstructed[:2]) if obstructed else "airflow paths open",
    })
    return checks


def score_layout(checks: list[dict], walkway_m: float | None = None,
                 cost_usd: float | None = None, budget_usd: float | None = None,
                 preference_hits: int = 0, carried_faults: int = 0) -> dict:
    """Deterministic 100-point score with an exposed breakdown.

    carried_faults: pre-existing hard faults this layout does NOT resolve —
    each costs fit points, so alternatives that fix them outrank the current
    arrangement."""
    hard = [c for c in checks if c.get("hard")]
    soft = [c for c in checks if not c.get("hard")]
    new_fail = any(not c["passed"] and not c.get("preexisting") for c in hard)
    fit = 0 if new_fail else max(0, 20 - 5 * carried_faults)
    clearance = round(20 * (sum(c["passed"] for c in soft) / len(soft))) if soft else 20
    if budget_usd and cost_usd is not None:
        cost = 20 if cost_usd <= budget_usd else max(0, round(20 * budget_usd / cost_usd))
    else:
        cost = 17 if cost_usd is None else 20
    # continuous ergonomics: full marks at a 1.5m clear lane
    ergo = round(20 * min(1.0, (walkway_m or 0.5) / 1.5))
    pref = min(20, 14 + 2 * preference_hits)
    total = fit + clearance + cost + ergo + pref
    return {
        "total": total,
        "breakdown": {
            "Fit": f"{fit}/20", "Clearance": f"{clearance}/20", "Cost": f"{cost}/20",
            "Ergonomics": f"{ergo}/20", "Preference": f"{pref}/20",
        },
    }
