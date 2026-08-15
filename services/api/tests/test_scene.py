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
