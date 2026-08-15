"""Vision pipeline: open-vocabulary detection (GroundingDINO) + segmentation (SlimSAM)
+ metric depth (Depth-Anything-V2). All small models chosen to fit an 8GB M2."""
import base64
import io
import math

import numpy as np
import torch
from PIL import Image

DEVICE = "cpu"  # MPS has op gaps for these models; small models are fast enough on CPU
MAX_SIDE = 1024
# Assumed horizontal field of view for a phone camera, used to turn pixels+depth into meters
ASSUMED_HFOV_DEG = 63.0

DETECT_PROMPT = (
    "sofa. couch. armchair. chair. table. coffee table. desk. lamp. floor lamp. rug. "
    "bed. shelf. bookshelf. plant. tv. television. cushion. pillow. curtain. mirror. "
    "artwork. picture frame. cabinet. dresser. nightstand. ottoman. stool. vase. clock."
)

# Open-vocabulary prompt for hardware / Founder mode scenes
FOUNDER_DETECT_PROMPT = (
    "graphics card. gpu. motherboard. cpu cooler. heatsink. fan. radiator. "
    "power supply. cable. ram. memory. ssd. hard drive. pc case. circuit board. "
    "pcb. sensor. camera. screen. monitor. battery. robot arm. motor. water pump. "
    "vent. keyboard. laptop. speaker. microcontroller. wire. antenna. drone."
)

_models: dict = {}


def _grounding_dino():
    if "dino" not in _models:
        from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor
        pid = "IDEA-Research/grounding-dino-tiny"
        _models["dino"] = (
            AutoProcessor.from_pretrained(pid),
            AutoModelForZeroShotObjectDetection.from_pretrained(pid).to(DEVICE).eval(),
        )
    return _models["dino"]


def _slim_sam():
    if "sam" not in _models:
        from transformers import SamModel, SamProcessor
        pid = "Zigeng/SlimSAM-uniform-77"
        _models["sam"] = (
            SamProcessor.from_pretrained(pid),
            SamModel.from_pretrained(pid).to(DEVICE).eval(),
        )
    return _models["sam"]


def _depth():
    if "depth" not in _models:
        from transformers import pipeline
        _models["depth"] = pipeline(
            "depth-estimation",
            model="depth-anything/Depth-Anything-V2-Metric-Indoor-Small-hf",
            device=-1,
        )
    return _models["depth"]


def _b64_png(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def prepare(image: Image.Image) -> Image.Image:
    image = image.convert("RGB")
    if max(image.size) > MAX_SIDE:
        image.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    return image


def analyze(image: Image.Image, prompt: str | None = None, on_stage=None) -> dict:
    image = prepare(image)
    w, h = image.size
    notify = on_stage or (lambda *_: None)

    # --- 1. detect objects ---
    notify("detect")
    proc, model = _grounding_dino()
    inputs = proc(images=image, text=prompt or DETECT_PROMPT, return_tensors="pt").to(DEVICE)
    with torch.no_grad():
        out = model(**inputs)
    results = proc.post_process_grounded_object_detection(
        out, inputs.input_ids, threshold=0.30, text_threshold=0.25,
        target_sizes=[(h, w)],
    )[0]

    boxes, labels, scores = [], [], []
    for box, label, score in zip(results["boxes"], results["text_labels"], results["scores"]):
        box = [float(v) for v in box]
        # drop near-duplicate boxes (same object matched by two prompt words)
        dup = False
        for i, other in enumerate(boxes):
            if _iou(box, other) > 0.75:
                dup = True
                if float(score) > scores[i]:
                    boxes[i], labels[i], scores[i] = box, label, float(score)
                break
        if not dup:
            boxes.append(box)
            labels.append(label)
            scores.append(float(score))

    # --- 2. metric depth ---
    notify("depth")
    depth_out = _depth()(image)
    depth_m = np.array(depth_out["predicted_depth"], dtype=np.float32)
    if depth_m.shape != (h, w):
        depth_m = np.array(
            Image.fromarray(depth_m).resize((w, h), Image.BILINEAR), dtype=np.float32
        )
    d_lo, d_hi = float(depth_m.min()), float(depth_m.max())
    depth_norm = ((depth_m - d_lo) / max(d_hi - d_lo, 1e-6) * 255).astype(np.uint8)

    # --- 3. segment each detection ---
    notify("segment")
    objects = []
    if boxes:
        sproc, smodel = _slim_sam()
        sinputs = sproc(image, input_boxes=[boxes], return_tensors="pt").to(DEVICE)
        with torch.no_grad():
            sout = smodel(**sinputs)
        masks = sproc.image_processor.post_process_masks(
            sout.pred_masks.cpu(),
            sinputs["original_sizes"].cpu(),
            sinputs["reshaped_input_sizes"].cpu(),
        )[0]  # (n_boxes, 3, H, W)
        iou_scores = sout.iou_scores.cpu()[0]  # (n_boxes, 3)

        fx = (w / 2) / math.tan(math.radians(ASSUMED_HFOV_DEG / 2))
        for i, (box, label, score) in enumerate(zip(boxes, labels, scores)):
            best = int(iou_scores[i].argmax())
            mask = masks[i, best].numpy().astype(bool)
            if mask.sum() < 100:
                continue
            obj_depth = float(np.median(depth_m[mask]))
            x0, y0, x1, y1 = box
            est_w = (x1 - x0) / fx * obj_depth
            est_h = (y1 - y0) / fx * obj_depth
            mask_img = Image.fromarray((mask * 255).astype(np.uint8), mode="L")
            objects.append({
                "id": i,
                "label": label,
                "score": round(score, 3),
                "box": [round(v, 1) for v in box],
                "mask_png": _b64_png(mask_img),
                "depth_m": round(obj_depth, 2),
                "est_width_m": round(est_w, 2),
                "est_height_m": round(est_h, 2),
            })

    return {
        "width": w,
        "height": h,
        "image_png": _b64_png(image),
        "depth_png": _b64_png(Image.fromarray(depth_norm, mode="L")),
        "depth_min_m": round(d_lo, 2),
        "depth_max_m": round(d_hi, 2),
        "objects": objects,
    }


def _iou(a, b) -> float:
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    ix = max(0.0, min(ax1, bx1) - max(ax0, bx0))
    iy = max(0.0, min(ay1, by1) - max(ay0, by0))
    inter = ix * iy
    union = (ax1 - ax0) * (ay1 - ay0) + (bx1 - bx0) * (by1 - by0) - inter
    return inter / union if union > 0 else 0.0
