# plop GPU services (Modal)

Two standalone GPU endpoints. The MIDI-3D one is already wired into the app;
the Hunyuan3D one is **on the side** — connect it whenever you want.

## 1. Scene 3D — MIDI-3D (`midi3d_app.py`) — CONNECTED

Room photo + instance seg map → untextured 3D scene GLB (one mesh per object).

- Endpoint: `https://abhiram-bhupatiraju7--plop-midi3d-midi3d-generate.modal.run`
- Used by `backend /api/scene3d` → frontend "✨ Generate true 3D" button
- ~2 min warm / ~5 min cold, max 5 instances per call, L40S

## 2. Photorealistic object 3D — Hunyuan3D-2 (`hunyuan_app.py`) — ON THE SIDE

One object image (crop) → **fully textured** 3D model (GLB with baked texture),
as close to the actual photo as single-image reconstruction gets.

- Endpoint: `https://abhiram-bhupatiraju7--plop-hunyuan3d-hunyuan3d-generate.modal.run`
- Request:  `POST {"image_b64": <png b64>, "steps": 30, "texture": true}`
- Response: `{"glb_b64": <textured glb b64>}`
- Pipeline: rembg → Hunyuan3D-DiT-v2 turbo (shape) → Hunyuan3D-Paint (texture)
- L40S, ~2-4 min warm per object; weights cached in volume `plop-hunyuan-weights`

### Try it

```bash
backend/.venv/bin/python modal_app/test_hunyuan.py path/to/object.png out.glb
```

Drop the resulting `out.glb` into https://gltf-viewer.donmccurdy.com to inspect.

### Connecting it later (suggested shape)

- Backend: add `/api/object3d` mirroring `scene3d.py` but calling the Hunyuan URL
  with a single object crop (see `frontend/src/scene.ts` `makeCutout` for crops).
- Frontend: per-object "View in 3D" button → `GlbView` already renders GLBs;
  textured GLBs need no material override (drop the color-override loop).

### Ops

```bash
backend/.venv/bin/modal deploy modal_app/hunyuan_app.py   # redeploy
backend/.venv/bin/modal app logs plop-hunyuan3d           # logs
```

Note: Hunyuan3D-2 weights are under the Tencent Hunyuan Community License
(fine for this use; has territory/commercial-scale limits worth reading before
launching a business on it). MIDI-3D is Apache-2.0.
