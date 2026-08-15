# Third-party notices

PLOP builds on the following open-source projects and models. Nothing GPL or
noncommercial-licensed is compiled into this codebase.

## Vendored code

| Project | Where | License | Modifications |
|---|---|---|---|
| [Hive](https://github.com/bossbobster/hive) (BossBobster) | `vendor/hive/` | MIT | UI untouched. Backend only: (1) replaced the retired model id `claude-sonnet-4-20250514` with `claude-sonnet-5`; (2) `web_research.py` persists the full research report in `draft_text` instead of the first 500 chars so the PLOP bridge can parse structured candidates. |
| plop prototype (Abhicodes8/plop, this team's own hackathon repo) | `services/api/app/{vision,inpaint,scene3d}.py` | team-internal | Extended: configurable detect prompt (Founder hardware vocabulary), stage callbacks for SSE progress. |

## Python dependencies (pip)

| Package | License | Used for |
|---|---|---|
| PyTorch | BSD-3 | model inference runtime |
| Hugging Face Transformers | Apache-2.0 | model loading/pipelines |
| FastAPI / Uvicorn / Starlette | MIT / BSD | API service |
| Pillow, NumPy | MIT-CMU / BSD | image + array processing |
| OpenCV (opencv-python-headless) | Apache-2.0 | mask morphology, Telea inpaint fallback |
| simple-lama-inpainting | Apache-2.0 | LaMa inpainting wrapper |
| anthropic | MIT | Claude provider |
| httpx / requests | BSD / Apache-2.0 | HTTP clients |

## Models (weights downloaded at runtime from Hugging Face)

| Model | License | Role |
|---|---|---|
| IDEA-Research/grounding-dino-tiny | Apache-2.0 | open-vocabulary object detection |
| Zigeng/SlimSAM-uniform-77 | Apache-2.0 | instance segmentation (SAM distilled) |
| depth-anything/Depth-Anything-V2-Metric-Indoor-Small-hf | Apache-2.0 | metric monocular depth |
| LaMa (via simple-lama-inpainting) | Apache-2.0 | object removal inpainting |

## Frontend dependencies (npm)

| Package | License |
|---|---|
| React, react-dom, react-router-dom | MIT |
| three.js | MIT |
| @react-three/fiber, @react-three/drei | MIT |
| zustand | MIT |
| Vite | MIT |

## Evaluated but not vendored

VGGT (Meta), COLMAP, nerfstudio/gsplat, SAM2 / Grounded-SAM-2, TRELLIS
(Microsoft), Open3D were evaluated as the multi-view/GPU path. They are not
compiled into this repo; the reconstruction service exposes a provider seam
(`services/api/app/scene3d.py`, Modal endpoint) where an image-to-3D or
multi-view service plugs in. Check each project's license before enabling it
in a deployment (e.g. SAM2 is Apache-2.0, COLMAP is BSD, but some model
weights carry their own terms).

## Reference material

- BuildCores and `buildcores/buildcores-open-db` were used as an interaction
  reference for Founder mode only. No BuildCores assets, code, or data are
  included.
- `references/demo-hardware.jpg` — "Water cooling setup.jpg", Wikimedia
  Commons, CC BY-SA 4.0. Used as a demo input image.
