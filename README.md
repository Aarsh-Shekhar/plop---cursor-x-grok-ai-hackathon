# PLOP

**Turn your space into an editable 3D workspace.**

PLOP rebuilds photos of real places — rooms, desks, offices, PCs, lab rigs,
hardware systems — into editable digital twins. Every recognized object is
indexed, selectable, movable, replaceable, inspectable, editable with natural
language, and connected to **Hive**, an autonomous agent swarm, for research
and real-world actions.

Think *Figma / Roblox Studio for the physical world*.

```
                         MEDIA (photos)
                           |
                           v
              +-------------------------+
              | Reconstruction Pipeline |   GroundingDINO · SlimSAM
              +-------------------------+   Depth-Anything-V2 · LaMa
                           |
                           v
                   EDITABLE SCENE  (SceneGraph, meters, provenance-tagged)
                           |
             +-------------+-------------+
             |                           |
             v                           v
      Consumer Mode                Founder Mode
      warm, minimal UI             graphite technical UI
      furniture, decor, fit        components, clearance, airflow
             |                           |
             +-------------+-------------+
                           |
                           v
                    PLOP COMMANDS  (NL -> validated scene ops)
                           |
                  @hive if external
                           |
                           v
                    HIVE SWARM  (vendor/hive — original UI)
                           |
                           v
              research / actions / results
                           |
                           v
              BACK TO SCENE  (structured candidates, previewable)
```

## What actually happens when you upload a photo

1. **Understanding objects** — GroundingDINO-tiny (open-vocabulary detection,
   different vocabularies per mode), SlimSAM instance masks, Depth-Anything-V2
   metric-indoor depth. All local, CPU, fits an 8 GB M-series Mac.
2. **Building geometry** — depth is unprojected into a metric world frame
   (Y-up, camera at origin); the floor plane is estimated from the depth cloud;
   each object gets a 3D position, real-world dimensions, and a persistent id.
3. **Applying materials** — every detected object is inpainted *out* of the
   photo (LaMa) so the backdrop is an empty room: moving an object never leaves
   a ghost copy. Objects render as cutout meshes with their real captured pixels.
4. **Indexing** — the editable SceneGraph is persisted and streamed to the
   browser; reconstruction progress streams over SSE and survives page refresh.

### Honesty model (important)

- A single photo does **not** yield ground-truth geometry. Observed appearance
  is preserved; unobserved depth/backsides are inferred and tagged `inferred`.
- Every dimension carries `source` (`inferred` / `identified` /
  `manufacturer-spec` / `user`) and a confidence. Founder mode surfaces these.
- Scale comes from monocular metric depth + an assumed phone FOV, so the header
  shows `scale: inferred` — never a fake "measured" claim.
- The airflow overlay is labeled **Approximate airflow — not CFD**. The
  simulation layer is an adapter seam where a real solver can plug in.
- Component identification shows its confidence (`likely RTX 5090 — 82% ·
  unconfirmed`) and never presents a guess as confirmed.

## The editor

- Orbit / pan / zoom (damped), camera presets (top / front / side / reset)
- Click to select; drag to move on the floor plane; **shift-drag** to lift;
  G/R/S switch move/rotate/scale gizmo; Esc deselects
- Undo/redo (⌘Z / ⇧⌘Z) over every edit, persisted to the backend (debounced)
- Scene tree grouped by category with visibility toggles and confidences
- Inspector: dimensions with provenance, transform, nudge buttons, identify
  (Claude/Grok vision), procedural materials (solid colors + zebra / checker /
  stripes / wood / dots — original photo shading is preserved, only albedo
  changes), duplicate / lock / remove
- Command bar: `make this rug zebra print`, `move the couch 1m left`,
  `which objects are wider than 1 meter?` — the LLM emits operations from a
  fixed vocabulary that are validated server-side before touching the scene
- Founder mode adds: hardware detection vocabulary, technical inspector
  (power, thermal role, connectors, visible text), clearance/overlap
  highlighting, approximate airflow overlay

## Hive (`@hive ...`)

Type `@hive research the best compatible alternatives` in the command bar:

1. PLOP serializes compact scene context (selected object, dimensions, colors,
   neighbors — never raw geometry) into a Hive generic task.
2. The **original Hive honeycomb UI** (vendored, MIT, visually untouched)
   opens in its own window showing the swarm working live.
3. When the run finishes, "Pull results into PLOP" parses the research into
   structured candidates (null price/dimensions when not stated — never
   invented) that preview in the scene as dimension-accurate proxies.

## Repository layout

```
plop/
  apps/web/            React + Vite + three.js/R3F editor, landing, projects
  services/api/        FastAPI: projects, scenes, jobs (SSE), commands,
                       identify/shop, Hive bridge
    app/               pipeline: vision -> geometry -> materials -> scenegraph
    providers/         LLM abstraction: grok.py (primary when XAI_API_KEY set),
                       anthropic_provider.py (fallback)
  vendor/hive/         Hive agent service (MIT) — UI preserved as-is
  references/          demo inputs
  scripts/dev.sh       start everything
  THIRD_PARTY_NOTICES.md
```

## Setup

```bash
# 1. PLOP API (Python 3.13)
cd services/api
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt   # simple-lama-inpainting may need --no-deps on 3.13
cp ../../.env.example .env                   # add XAI_API_KEY and/or ANTHROPIC_API_KEY

# 2. Hive
cd ../../vendor/hive
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt playwright
cp ../../services/api/.env backend/.env      # needs ANTHROPIC_API_KEY; Google OAuth optional

# 3. Frontends
cd frontend && npm install && cd ../../../apps/web && npm install

# 4. Run everything
./scripts/dev.sh
# PLOP: http://localhost:5174   Hive: http://localhost:3000
```

First reconstruction downloads ~1 GB of model weights from Hugging Face and
runs locally on CPU (no NVIDIA GPU required).

### Optional GPU service

`services/api/app/scene3d.py` proxies a Modal GPU endpoint (MIDI-3D /
TRELLIS-class image-to-3D) behind `MODAL_MIDI3D_URL` for true per-object
meshes. Multi-view fusion (VGGT → COLMAP → gsplat) plugs in behind the same
Scene schema; see THIRD_PARTY_NOTICES for license notes.

## Model providers

`services/api/providers/` defines one interface (`generate_structured`,
`generate_structured_with_search`, `reason`). If `XAI_API_KEY` is set, **Grok
(grok-4 + Live Search)** is the active provider for command parsing, object
identification and shopping search; otherwise Anthropic Claude is used.
No secrets in source or frontend bundles — env vars only.

## Tests

```bash
cd services/api && .venv/bin/python -m pytest tests/   # scene math, command validation, serializers
cd apps/web && npx tsc -b                              # strict typecheck
```

## Supported inputs

JPEG / PNG / WebP / HEIC photos up to 25 MB. One photo per Space today;
multiple Spaces per project. Multi-view fusion and video are GPU-service
extensions (seams already in place).

## Known limitations

- Single-view reconstruction: object backsides are inferred, not captured;
  cutout meshes are billboards with estimated thickness, not full meshes.
- Absolute scale is inferred (see honesty model) until a reference measurement
  is provided.
- Hive's browser-based pipelines run headless Playwright; Gmail/Calendar
  actions require optional Google OAuth setup (see `vendor/hive/backend/.env.example`).
- Electrical behavior is never inferred from photos; netlist import is the
  designed seam for real circuit simulation.
