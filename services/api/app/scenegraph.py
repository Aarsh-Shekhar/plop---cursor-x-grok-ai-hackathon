"""Build an editable SceneGraph from the vision pipeline output.

World coordinate system: meters, Y up, camera at origin looking down -Z.
The floor height is estimated from the unprojected depth cloud; every
object's position is the unprojected centroid of its mask, dropped so the
object's base rests near the floor when it is plausibly floor-standing.

Every derived quantity carries a `source` + `confidence` so the UI never
presents an inference as a measurement (Founder-mode honesty requirement).
"""
from __future__ import annotations

import math

import numpy as np

# Must match vision.ASSUMED_HFOV_DEG — an assumed phone-camera FOV, which is
# why scaleConfidence stays "inferred" until the user calibrates.
HFOV_DEG = 63.0


def focal_px(width: int) -> float:
    return (width / 2) / math.tan(math.radians(HFOV_DEG / 2))


def unproject(px: float, py: float, depth_m: float, w: int, h: int) -> tuple[float, float, float]:
    """Image pixel + metric depth -> camera-space meters (Y up, -Z forward)."""
    fx = focal_px(w)
    x = (px - w / 2) / fx * depth_m
    y = -(py - h / 2) / fx * depth_m
    z = -depth_m
    return (x, y, z)


def estimate_floor_y(depth: np.ndarray, w: int, h: int, d_lo: float, d_hi: float) -> float:
    """5th percentile of unprojected Y over the lower half of the image."""
    fx = focal_px(w)
    ys = []
    step = max(1, w // 160)
    for py in range(h // 2, h, step):
        for px in range(0, w, step):
            d = d_lo + (depth[py, px] / 255.0) * (d_hi - d_lo)
            ys.append(-(py - h / 2) / fx * d)
    if not ys:
        return -1.2
    return float(np.percentile(np.array(ys), 5))


def mask_centroid(mask: np.ndarray) -> tuple[float, float]:
    ys, xs = np.nonzero(mask)
    return (float(xs.mean()), float(ys.mean()))


def build_object(
    idx: int,
    det: dict,
    mask: np.ndarray,
    w: int,
    h: int,
    floor_y: float,
    mode: str,
) -> dict:
    """Turn one detection (from vision.analyze) into a SceneObject."""
    x0, y0, x1, y1 = det["box"]
    depth_m = det["depth_m"]
    cx_px, cy_px = mask_centroid(mask)
    cx, cy, cz = unproject(cx_px, cy_px, depth_m, w, h)

    width_m = max(0.05, det["est_width_m"])
    height_m = max(0.05, det["est_height_m"])
    # Depth (thickness) is unobserved from one view — conservative inference.
    depth_dim = round(max(0.04, min(width_m, height_m) * 0.6), 2)

    # If the object's estimated base sits near the floor, snap it to the floor.
    base_y = cy - height_m / 2
    floor_standing = base_y < floor_y + 0.45
    pos_y = (floor_y + height_m / 2) if floor_standing else cy

    label = det["label"]
    return {
        "id": f"obj_{idx}",
        "name": label.title(),
        "label": label,
        "category": categorize(label, mode),
        "score": det["score"],
        "transform": {
            "position": [round(cx, 3), round(pos_y, 3), round(cz, 3)],
            "rotationY": 0.0,
            "scale": [1.0, 1.0, 1.0],
        },
        "dimensions": {
            "width": round(width_m, 2),
            "height": round(height_m, 2),
            "depth": depth_dim,
            "source": "inferred",       # depth-based estimate, not a measurement
            "confidence": round(min(0.9, det["score"] + 0.15), 2),
        },
        "geometry": {
            "kind": "cutout",
            "textureUri": det["cutout_uri"],
            "box": det["box"],
            "source": "observed-front", # back side is not captured
        },
        "appearance": {
            "material": {"type": "original"},
            "dominantColors": det.get("dominant_colors", []),
        },
        "perception": {
            "confidence": det["score"],
            "maskUri": det["mask_uri"],
            "depthM": depth_m,
            "floorStanding": floor_standing,
        },
        "semantic": {"description": None, "productMatches": []},
        "technical": {},
        "state": {"hidden": False, "locked": False},
    }


CONSUMER_CATEGORIES = {
    "sofa": "seating", "couch": "seating", "armchair": "seating", "chair": "seating",
    "ottoman": "seating", "stool": "seating", "bed": "furniture",
    "table": "table", "coffee table": "table", "desk": "table", "nightstand": "table",
    "lamp": "lighting", "floor lamp": "lighting",
    "rug": "textile", "curtain": "textile", "cushion": "textile", "pillow": "textile",
    "shelf": "storage", "bookshelf": "storage", "cabinet": "storage", "dresser": "storage",
    "plant": "decor", "vase": "decor", "mirror": "decor", "artwork": "decor",
    "picture frame": "decor", "clock": "decor",
    "tv": "electronics", "television": "electronics",
}

FOUNDER_CATEGORIES = {
    "gpu": "compute", "graphics card": "compute", "motherboard": "compute",
    "cpu cooler": "cooling", "heatsink": "cooling", "fan": "cooling",
    "radiator": "cooling", "water pump": "cooling",
    "power supply": "power", "battery": "power", "cable": "cabling",
    "ram": "compute", "memory": "compute", "ssd": "storage", "hard drive": "storage",
    "pc case": "enclosure", "chassis": "enclosure", "vent": "enclosure",
    "circuit board": "electronics", "pcb": "electronics", "sensor": "sensing",
    "camera": "sensing", "screen": "display", "monitor": "display",
    "robot arm": "actuation", "motor": "actuation",
}


def categorize(label: str, mode: str) -> str:
    table = FOUNDER_CATEGORIES if mode == "founder" else CONSUMER_CATEGORIES
    return table.get(label.lower(), "object")


def build_scene(
    scene_id: str,
    project_id: str,
    name: str,
    mode: str,
    capture: dict,
    objects: list[dict],
    floor_y: float,
) -> dict:
    return {
        "id": scene_id,
        "projectId": project_id,
        "name": name,
        "mode": mode,
        "status": "ready",
        "units": "m",
        "coordinateSystem": "y-up, camera at origin, -Z forward",
        # Scale comes from a monocular metric-depth model + assumed FOV.
        "scaleConfidence": "inferred",
        "capture": capture,
        "environment": {"floorY": round(floor_y, 3), "backdrop": "depth-mesh"},
        "objects": objects,
        "revisions": [],
        "createdAt": None,
    }
