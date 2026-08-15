"""Proxy to the Modal MIDI-3D endpoint: image + instance masks -> scene GLB."""
import base64
import io
import os

import numpy as np
import requests
from PIL import Image

MODAL_URL = os.environ.get("MODAL_MIDI3D_URL", "")
HUNYUAN_URL = os.environ.get("HUNYUAN3D_URL", "")
MAX_INSTANCES = 5


def build_seg_map(size: tuple[int, int], mask_b64s: list[str]) -> Image.Image:
    """Compose per-object masks into one labeled seg image (1..N, 0=bg)."""
    seg = np.zeros((size[1], size[0]), dtype=np.uint8)
    for i, b64 in enumerate(mask_b64s[:MAX_INSTANCES]):
        m = Image.open(io.BytesIO(base64.b64decode(b64))).convert("L").resize(size, Image.NEAREST)
        seg[np.array(m) > 127] = i + 1
    return Image.fromarray(seg, mode="L")


def generate_object(image_b64: str, mask_b64: str, steps: int = 30) -> dict:
    """Photorealistic textured 3D for ONE object via Hunyuan3D-2 on Modal."""
    if not HUNYUAN_URL:
        raise RuntimeError("HUNYUAN3D_URL is not set in backend/.env")
    img = Image.open(io.BytesIO(base64.b64decode(image_b64))).convert("RGB")
    mask = Image.open(io.BytesIO(base64.b64decode(mask_b64))).convert("L").resize(img.size, Image.NEAREST)
    arr = np.array(img).copy()
    m = np.array(mask)
    arr[m <= 127] = 255  # white out everything but the object
    ys, xs = np.where(m > 127)
    if len(xs) == 0:
        raise RuntimeError("empty mask")
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    pw, ph = int((x1 - x0) * 0.12) + 4, int((y1 - y0) * 0.12) + 4
    crop = Image.fromarray(arr).crop((
        max(0, x0 - pw), max(0, y0 - ph),
        min(img.width, x1 + pw), min(img.height, y1 + ph),
    ))
    buf = io.BytesIO()
    crop.save(buf, format="PNG")
    resp = requests.post(
        HUNYUAN_URL,
        json={"image_b64": base64.b64encode(buf.getvalue()).decode(), "steps": steps},
        timeout=1200,
    )
    resp.raise_for_status()
    return resp.json()


def generate(image_b64: str, mask_b64s: list[str], steps: int = 35) -> dict:
    if not MODAL_URL:
        raise RuntimeError("MODAL_MIDI3D_URL is not set in backend/.env")
    img = Image.open(io.BytesIO(base64.b64decode(image_b64))).convert("RGB")
    seg = build_seg_map(img.size, mask_b64s)
    buf = io.BytesIO()
    seg.save(buf, format="PNG")
    resp = requests.post(
        MODAL_URL,
        json={
            "image_b64": image_b64,
            "seg_b64": base64.b64encode(buf.getvalue()).decode(),
            "steps": steps,
        },
        timeout=900,
    )
    resp.raise_for_status()
    return resp.json()
