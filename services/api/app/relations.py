"""Machine-readable scene graph: deterministic spatial relationships derived
from object AABBs. No LLM involved."""
from __future__ import annotations

from .constraints import AABB, obj_aabb, is_floor_standing


def derive_relations(scene: dict) -> list[dict]:
    objs = [o for o in scene["objects"] if not o["state"]["hidden"]]
    boxes = {o["id"]: obj_aabb(o) for o in objs}
    rels: list[dict] = []

    def add(a, rel, b, detail=""):
        rels.append({"from": a["name"], "fromId": a["id"], "rel": rel,
                     "to": b["name"], "toId": b["id"], "detail": detail})

    for a in objs:
        ba = boxes[a["id"]]
        for b in objs:
            if a["id"] >= b["id"]:
                continue
            bb = boxes[b["id"]]
            # ON_TOP_OF: a's base sits near b's top, footprints overlap
            if abs(ba.min_y - bb.max_y) < 0.12 and _footprint_overlap(ba, bb) > 0.3:
                add(a, "ON_TOP_OF", b)
                continue
            if abs(bb.min_y - ba.max_y) < 0.12 and _footprint_overlap(bb, ba) > 0.3:
                add(b, "ON_TOP_OF", a)
                continue
            gap = ba.clearance_to(bb)
            if gap < 0.02 and ba.intersects(bb):
                add(a, "TOUCHING", b)
            elif gap < 0.35:
                add(a, "NEXT_TO", b, f"{gap * 100:.0f} cm apart")
            elif gap < 1.0:
                add(a, "NEAR", b, f"{gap * 100:.0f} cm")

    # BLOCKS: tall floor objects in front of windows/doors
    zones = [o for o in objs if any(k in o["label"] for k in ("window", "door"))]
    for z in zones:
        zb = boxes[z["id"]]
        front = AABB(zb.cx, zb.cy, zb.cz, zb.w + 0.3, zb.h, zb.d + 0.9)
        for o in objs:
            if o["id"] == z["id"] or not is_floor_standing(o):
                continue
            if boxes[o["id"]].max_y - zb.min_y > 0.8 and boxes[o["id"]].intersects(front):
                add(o, "BLOCKS", z)

    # founder: POWERED_BY / COOLED_BY from categories
    if scene.get("mode") == "founder":
        psu = next((o for o in objs if o["category"] == "power"), None)
        coolers = [o for o in objs if o["category"] == "cooling"]
        for o in objs:
            role = (o.get("technical") or {}).get("thermal_role")
            if psu and o["id"] != psu["id"] and o["category"] in ("compute", "cooling", "storage"):
                add(o, "POWERED_BY", psu)
            if role == "heat-source":
                for c in coolers:
                    if boxes[o["id"]].clearance_to(boxes[c["id"]]) < 0.25:
                        add(o, "COOLED_BY", c)
    return rels


def _footprint_overlap(a: AABB, b: AABB) -> float:
    """Fraction of a's footprint overlapped by b's."""
    ox = max(0.0, min(a.max_x, b.max_x) - max(a.min_x, b.min_x))
    oz = max(0.0, min(a.max_z, b.max_z) - max(a.min_z, b.min_z))
    area = a.w * a.d
    return (ox * oz) / area if area > 0 else 0.0


def scene_graph(scene: dict) -> dict:
    """Tree + relations + stats for the technical view."""
    objs = [o for o in scene["objects"] if not o["state"]["hidden"]]
    by_cat: dict[str, list[dict]] = {}
    for o in objs:
        by_cat.setdefault(o["category"], []).append({
            "id": o["id"], "name": o["name"],
            "dims_cm": [round(o["dimensions"]["width"] * 100),
                        round(o["dimensions"]["height"] * 100),
                        round(o["dimensions"]["depth"] * 100)],
            "dimSource": o["dimensions"]["source"],
            "confidence": o["perception"]["confidence"],
        })
    return {
        "sceneId": scene["id"],
        "mode": scene["mode"],
        "scaleConfidence": scene.get("scaleConfidence"),
        "objectCount": len(objs),
        "tree": by_cat,
        "relations": derive_relations(scene),
    }
