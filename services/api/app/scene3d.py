"""Proxy to the Modal MIDI-3D endpoint: image + instance masks -> scene GLB."""
import base64
import io
import os

import numpy as np
import requests
from PIL import Image

MODAL_URL = os.environ.get("MODAL_MIDI3D_URL", "")
MAX_INSTANCES = 5


def build_seg_map(size: tuple[int, int], mask_b64s: list[str]) -> Image.Image:
    """Compose per-object masks into one labeled seg image (1..N, 0=bg)."""
    seg = np.zeros((size[1], size[0]), dtype=np.uint8)
    for i, b64 in enumerate(mask_b64s[:MAX_INSTANCES]):
        m = Image.open(io.BytesIO(base64.b64decode(b64))).convert("L").resize(size, Image.NEAREST)
        seg[np.array(m) > 127] = i + 1
    return Image.fromarray(seg, mode="L")


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
