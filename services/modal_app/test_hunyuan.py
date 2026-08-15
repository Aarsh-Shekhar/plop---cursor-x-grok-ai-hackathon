"""Standalone test for the Hunyuan3D endpoint: image in, textured GLB out.

Usage: python modal_app/test_hunyuan.py <object_image.png> [out.glb]
"""
import base64
import sys
import time

import requests

URL = "https://abhiram-bhupatiraju7--plop-hunyuan3d-hunyuan3d-generate.modal.run"

image_path = sys.argv[1]
out_path = sys.argv[2] if len(sys.argv) > 2 else "object_textured.glb"

image_b64 = base64.b64encode(open(image_path, "rb").read()).decode()
print(f"generating textured 3D for {image_path} (cold start can take ~10 min)...")
t0 = time.time()
r = requests.post(URL, json={"image_b64": image_b64, "steps": 30}, timeout=1800)
r.raise_for_status()
glb = base64.b64decode(r.json()["glb_b64"])
open(out_path, "wb").write(glb)
print(f"wrote {out_path} ({len(glb) // 1024}KB) in {time.time() - t0:.0f}s")
