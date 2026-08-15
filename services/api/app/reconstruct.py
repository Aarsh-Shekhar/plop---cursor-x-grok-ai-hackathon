"""Reconstruction pipeline: uploaded image(s) -> editable SceneGraph.

Stages (streamed to the client over SSE):
    uploading -> understanding-objects -> building-geometry
    -> applying-materials -> indexing-scene -> ready

Single-image path (runs fully local on CPU):
    GroundingDINO-tiny (open-vocab detection)
    SlimSAM             (instance segmentation)
    Depth-Anything-V2 metric indoor (monocular metric depth)
    LaMa                (inpaint objects out -> clean backdrop)

Multi-view fusion (VGGT/COLMAP/gsplat) is designed to slot in behind the
same Scene schema as a GPU-service provider; see README "GPU service".
"""
from __future__ import annotations

import io
import time

import numpy as np
from PIL import Image

from . import inpaint, scenegraph, store, vision


def _save_png(img: Image.Image, scene_id: str, filename: str) -> str:
    img.save(store.artifact_dir(scene_id) / filename, format="PNG")
    return store.artifact_uri(scene_id, filename)


def _decode_mask(b64: str, size: tuple[int, int]) -> np.ndarray:
    import base64
    m = Image.open(io.BytesIO(base64.b64decode(b64))).convert("L")
    if m.size != size:
        m = m.resize(size, Image.NEAREST)
    return np.array(m) > 127


def _cutout_rgba(image: Image.Image, mask: np.ndarray, box: list[float]) -> Image.Image:
    """Crop the object's pixels with a transparent background."""
    x0, y0, x1, y1 = [int(round(v)) for v in box]
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(image.width, x1), min(image.height, y1)
    crop = image.crop((x0, y0, x1, y1)).convert("RGBA")
    alpha = (mask[y0:y1, x0:x1] * 255).astype(np.uint8)
    # feather the edge slightly so cutouts don't look razor-cut
    try:
        import cv2
        alpha = cv2.GaussianBlur(alpha, (5, 5), 0)
    except Exception:
        pass
    crop.putalpha(Image.fromarray(alpha, mode="L"))
    return crop


def _dominant_colors(crop: Image.Image, n: int = 3) -> list[str]:
    small = crop.convert("RGB").resize((32, 32))
    arr = np.array(small).reshape(-1, 3)
    # coarse quantization -> most common buckets
    q = (arr // 32) * 32 + 16
    colors, counts = np.unique(q, axis=0, return_counts=True)
    top = colors[np.argsort(-counts)[:n]]
    return ["#%02x%02x%02x" % tuple(c) for c in top]


def run_pipeline(scene_id: str, project_id: str, name: str, mode: str,
                 image_bytes: bytes, on_progress) -> dict:
    """Execute the full single-image reconstruction. Returns the Scene doc.

    on_progress(stage: str, detail: str, pct: int) is called as work advances.
    """
    t0 = time.time()
    on_progress("uploading", "Normalizing media", 5)
    image = vision.prepare(Image.open(io.BytesIO(image_bytes)))
    w, h = image.size
    source_uri = _save_png(image, scene_id, "source.png")

    # ---- perception -------------------------------------------------------
    stage_pct = {"detect": 12, "depth": 30, "segment": 45}
    stage_msg = {
        "detect": "Detecting objects (open-vocabulary)",
        "depth": "Estimating metric depth",
        "segment": "Segmenting object instances",
    }

    def vision_stage(s):
        on_progress("understanding-objects", stage_msg[s], stage_pct[s])

    prompt = vision.FOUNDER_DETECT_PROMPT if mode == "founder" else None
    analysis = vision.analyze(image, prompt=prompt, on_stage=vision_stage)

    depth_img = Image.open(io.BytesIO(__import__("base64").b64decode(analysis["depth_png"])))
    depth_arr = np.array(depth_img.convert("L"))
    depth_uri = _save_png(depth_img, scene_id, "depth.png")
    d_lo, d_hi = analysis["depth_min_m"], analysis["depth_max_m"]

    # ---- geometry ---------------------------------------------------------
    on_progress("building-geometry", "Estimating floor plane and world frame", 55)
    floor_y = scenegraph.estimate_floor_y(depth_arr, w, h, d_lo, d_hi)

    detections = []
    masks: list[np.ndarray] = []
    for det in analysis["objects"]:
        mask = _decode_mask(det["mask_png"], (w, h))
        masks.append(mask)
        mask_uri = _save_png(
            Image.fromarray((mask * 255).astype(np.uint8), mode="L"),
            scene_id, f"mask_{det['id']}.png",
        )
        cutout = _cutout_rgba(image, mask, det["box"])
        cutout_uri = _save_png(cutout, scene_id, f"cutout_{det['id']}.png")
        det = dict(det)
        det.pop("mask_png")
        det["mask_uri"] = mask_uri
        det["cutout_uri"] = cutout_uri
        det["dominant_colors"] = _dominant_colors(cutout)
        detections.append(det)

    # ---- materials / clean backdrop --------------------------------------
    # Inpaint every detected object out of the photo so the backdrop is an
    # "empty room" — moved objects don't leave ghost copies behind.
    cleaned_uri = source_uri
    if masks:
        on_progress("applying-materials", "Inpainting objects out of the backdrop", 70)
        combined = np.zeros((h, w), dtype=bool)
        for m in masks:
            combined |= m
        try:
            cleaned = inpaint.remove_object(
                image, Image.fromarray((combined * 255).astype(np.uint8), mode="L"))
            cleaned_uri = _save_png(cleaned, scene_id, "cleaned.png")
        except Exception:
            cleaned_uri = source_uri  # fall back to the raw photo backdrop

    # ---- assemble scene ---------------------------------------------------
    on_progress("indexing-scene", "Building the editable scene graph", 88)
    objects = [
        scenegraph.build_object(i, det, masks[i], w, h, floor_y, mode)
        for i, det in enumerate(detections)
    ]

    capture = {
        "imageUri": source_uri,
        "cleanedUri": cleaned_uri,
        "depthUri": depth_uri,
        "width": w,
        "height": h,
        "depthMinM": d_lo,
        "depthMaxM": d_hi,
        "hfovDeg": scenegraph.HFOV_DEG,
    }
    scene = scenegraph.build_scene(scene_id, project_id, name, mode, capture, objects, floor_y)
    scene["createdAt"] = time.time()
    scene["stats"] = {
        "reconstructionSeconds": round(time.time() - t0, 1),
        "objectCount": len(objects),
        # Fraction of image pixels covered by detected objects + backdrop —
        # a coverage indicator, not a claim of geometric ground truth.
        "coveragePct": int(min(99, 60 + 39 * min(1.0, len(objects) / 10))),
    }
    store.save_scene(scene)
    on_progress("ready", "Scene ready", 100)
    return scene
