"""Unit tests: scene math, command validation, candidate extraction schema."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import scenegraph  # noqa: E402
from app.commands import validate  # noqa: E402


def make_scene(objects):
    return {"mode": "consumer", "objects": objects}


def obj(id_, x=0, y=0, z=-3):
    return {
        "id": id_, "name": id_, "category": "seating",
        "transform": {"position": [x, y, z], "rotationY": 0, "scale": [1, 1, 1]},
        "dimensions": {"width": 1, "height": 1, "depth": 0.5,
                       "source": "inferred", "confidence": 0.8},
        "appearance": {"material": {"type": "original"}, "dominantColors": []},
        "perception": {"confidence": 0.8},
        "state": {"hidden": False, "locked": False},
    }


# ---- unprojection --------------------------------------------------------

def test_unproject_center_pixel_lands_on_axis():
    x, y, z = scenegraph.unproject(512, 384, 3.0, 1024, 768)
    assert abs(x) < 1e-6 and abs(y) < 1e-6
    assert z == -3.0


def test_unproject_left_pixel_is_negative_x():
    x, _, _ = scenegraph.unproject(0, 384, 2.0, 1024, 768)
    assert x < 0


def test_focal_px_matches_fov():
    # at HFOV 63 deg, a ray through the image edge must make 31.5 deg with axis
    import math
    fx = scenegraph.focal_px(1000)
    assert abs(math.degrees(math.atan((500) / fx)) - 31.5) < 0.01


def test_floor_estimate_below_camera():
    depth = np.full((100, 100), 128, dtype=np.uint8)
    floor = scenegraph.estimate_floor_y(depth, 100, 100, 1.0, 5.0)
    assert floor < 0  # camera looks at a room: floor is below eye height


# ---- command validation --------------------------------------------------

def test_validate_drops_unknown_ids():
    scene = make_scene([obj("obj_1")])
    result = validate(scene, {"commands": [
        {"operation": "move", "targetObjectIds": ["obj_999"], "params": {"delta": [1, 0, 0]}},
        {"operation": "move", "targetObjectIds": ["obj_1"], "params": {"delta": [1, 0, 0]}},
    ], "assistantNote": "ok"})
    assert len(result["commands"]) == 1
    assert result["commands"][0]["targetObjectIds"] == ["obj_1"]


def test_validate_clamps_teleport_deltas():
    scene = make_scene([obj("obj_1")])
    result = validate(scene, {"commands": [
        {"operation": "move", "targetObjectIds": ["obj_1"], "params": {"delta": [999, 0, -999]}},
    ], "assistantNote": "ok"})
    assert result["commands"][0]["params"]["delta"] == [10, 0, -10]


def test_validate_rejects_bad_operation():
    scene = make_scene([obj("obj_1")])
    result = validate(scene, {"commands": [
        {"operation": "rm -rf", "targetObjectIds": ["obj_1"], "params": {}},
    ], "assistantNote": "ok"})
    assert result["commands"] == []


def test_validate_drops_malformed_vectors():
    scene = make_scene([obj("obj_1")])
    result = validate(scene, {"commands": [
        {"operation": "move", "targetObjectIds": ["obj_1"], "params": {"position": [1, 2]}},
    ], "assistantNote": "ok"})
    assert "position" not in result["commands"][0]["params"]


# ---- object building -----------------------------------------------------

def test_build_object_floor_snap():
    mask = np.zeros((100, 100), dtype=bool)
    mask[60:90, 40:60] = True
    det = {
        "box": [40, 60, 60, 90], "depth_m": 2.0, "score": 0.9,
        "est_width_m": 0.5, "est_height_m": 0.8,
        "cutout_uri": "/x.png", "mask_uri": "/m.png", "dominant_colors": [],
        "label": "chair", "id": 0,
    }
    o = scenegraph.build_object(0, det, mask, 100, 100, floor_y=-1.2, mode="consumer")
    assert o["dimensions"]["source"] == "inferred"
    assert o["category"] == "seating"
    # floor-standing: base must rest on the floor
    base = o["transform"]["position"][1] - o["dimensions"]["height"] / 2
    assert abs(base - (-1.2)) < 1e-6


def test_hive_context_serializer_compact():
    from app.hive_bridge import serialize_scene_context
    scene = {
        "mode": "consumer", "scaleConfidence": "inferred",
        "objects": [dict(obj("obj_1"), semantic={}, **{}) for _ in range(1)],
    }
    ctx = serialize_scene_context(scene, ["obj_1"])
    assert "SELECTED OBJECT" in ctx
    assert len(ctx) < 2000  # never ship gigabytes of geometry to the agent


# ---- constraint engine ---------------------------------------------------

def _mkscene(objs):
    return {"mode": "consumer", "environment": {"floorY": 0}, "objects": objs}


def _fobj(id_, x, z, w=1.0, d=0.5, h=1.0, label="sofa", cat="seating"):
    o = obj(id_, x, h / 2, z)
    o["label"] = label
    o["category"] = cat
    o["dimensions"].update({"width": w, "depth": d, "height": h})
    o["perception"]["floorStanding"] = True
    return o


def test_collision_detected():
    from app.constraints import check_layout
    s = _mkscene([_fobj("a", 0, 0), _fobj("b", 0.2, 0)])
    checks = check_layout(s)
    coll = next(c for c in checks if c["label"] == "No collisions")
    assert not coll["passed"] and coll["hard"]


def test_no_collision_when_apart():
    from app.constraints import check_layout
    s = _mkscene([_fobj("a", 0, 0), _fobj("b", 3.0, 0)])
    checks = check_layout(s)
    assert next(c for c in checks if c["label"] == "No collisions")["passed"]


def test_override_positions_used():
    from app.constraints import check_layout
    s = _mkscene([_fobj("a", 0, 0), _fobj("b", 0.2, 0)])
    checks = check_layout(s, overrides={"b": [3.0, 0.5, 0]})
    assert next(c for c in checks if c["label"] == "No collisions")["passed"]


def test_window_blocking():
    from app.constraints import check_layout
    win = _fobj("w", 0, -2, w=1.5, d=0.1, h=1.5, label="window", cat="decor")
    win["perception"]["floorStanding"] = False
    tall = _fobj("t", 0, -1.6, w=1.0, d=0.4, h=1.8, label="bookshelf", cat="storage")
    s = _mkscene([win, tall])
    checks = check_layout(s)
    blocked = next((c for c in checks if "unobstructed" in c["label"]), None)
    assert blocked is not None and not blocked["passed"]


def test_fit_report_clearance():
    from app.constraints import fit_report
    # two objects define the room extent; candidate sits between them
    s = _mkscene([_fobj("a", 0, 0, w=1.0, d=1.0), _fobj("b", 3.0, 0, w=1.0, d=1.0)])
    r = fit_report(s, (0.5, 0.5, 0.5), [1.5, 0.25, 0.0])
    assert r["fits"] and r["clearance_cm"] > 0


def test_fit_report_rejects_collision():
    from app.constraints import fit_report
    s = _mkscene([_fobj("a", 0, 0, w=1.0, d=1.0), _fobj("b", 3.0, 0, w=1.0, d=1.0)])
    r = fit_report(s, (1.2, 0.5, 1.2), [0.3, 0.25, 0.0])
    assert not r["fits"]


def test_relations_on_top_of():
    from app.relations import derive_relations
    table = _fobj("t", 0, 0, w=1.2, d=0.6, h=0.45, label="table", cat="table")
    vase = _fobj("v", 0, 0, w=0.1, d=0.1, h=0.2, label="vase", cat="decor")
    vase["transform"]["position"] = [0, 0.55, 0]
    s = _mkscene([table, vase])
    rels = derive_relations(s)
    assert any(r["rel"] == "ON_TOP_OF" and r["fromId"] == "v" for r in rels)


def test_score_breakdown_sums():
    from app.constraints import score_layout
    checks = [{"label": "x", "passed": True, "hard": True},
              {"label": "y", "passed": True, "hard": False}]
    s = score_layout(checks, walkway_m=1.0, cost_usd=500, budget_usd=1000)
    parts = sum(int(v.split("/")[0]) for v in s["breakdown"].values())
    assert parts == s["total"] <= 100
