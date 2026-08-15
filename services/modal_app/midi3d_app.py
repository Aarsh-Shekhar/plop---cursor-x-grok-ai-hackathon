"""MIDI-3D on Modal: single room image + instance seg map -> 3D scene GLB.

Deploy:  modal deploy modal_app/midi3d_app.py
Call:    POST <url>  {"image_b64": ..., "seg_b64": ..., "steps": 35}
         -> {"glb_b64": ...}
"""
import base64
import io
import os

import modal

app = modal.App("plop-midi3d")

MIDI_DIR = "/root/MIDI-3D"
WEIGHTS_DIR = "/weights/MIDI-3D"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "libgl1", "libglib2.0-0", "libgomp1", "libegl1", "libxrender1")
    .pip_install(
        "torch==2.4.0",
        "torchvision==0.19.0",
        index_url="https://download.pytorch.org/whl/cu121",
    )
    .pip_install(
        "torch-cluster",
        find_links="https://data.pyg.org/whl/torch-2.4.0+cu121.html",
    )
    .pip_install(
        "diffusers==0.32.2",
        "transformers==4.49.0",
        "pydantic==2.10.6",
        "einops",
        "huggingface_hub",
        "opencv-python-headless",
        "trimesh",
        "omegaconf",
        "scikit-image",
        "numpy<2",
        "peft",
        "pytorch-lightning",
        "open3d",
        "pymeshlab",
        "fastapi[standard]",
    )
    .run_commands(f"git clone --depth 1 https://github.com/VAST-AI-Research/MIDI-3D {MIDI_DIR}")
)

weights = modal.Volume.from_name("plop-midi3d-weights", create_if_missing=True)


@app.cls(
    image=image,
    gpu="L40S",
    volumes={"/weights": weights},
    timeout=900,
    scaledown_window=300,
)
class Midi3D:
    @modal.enter()
    def load(self):
        import sys
        sys.path.insert(0, MIDI_DIR)
        import torch
        from huggingface_hub import snapshot_download

        snapshot_download(repo_id="VAST-AI/MIDI-3D", local_dir=WEIGHTS_DIR)
        weights.commit()

        from midi.pipelines.pipeline_midi import MIDIPipeline

        self.torch = torch
        self.pipe = MIDIPipeline.from_pretrained(WEIGHTS_DIR).to("cuda", torch.bfloat16)
        self.pipe.init_custom_adapter(
            set_self_attn_module_names=[
                "blocks.8", "blocks.9", "blocks.10", "blocks.11", "blocks.12",
            ]
        )

    @modal.fastapi_endpoint(method="POST")
    def generate(self, payload: dict):
        import sys
        sys.path.insert(0, MIDI_DIR)
        import numpy as np
        import trimesh
        from PIL import Image
        from skimage import measure
        from midi.utils.smoothing import smooth_gpu

        torch = self.torch
        rgb = Image.open(io.BytesIO(base64.b64decode(payload["image_b64"]))).convert("RGB")
        seg = Image.open(io.BytesIO(base64.b64decode(payload["seg_b64"]))).convert("L")
        steps = int(payload.get("steps", 35))
        seed = int(payload.get("seed", 42))

        rgb_array = np.array(rgb)
        seg_array = np.array(seg)
        label_ids = np.unique(seg_array)
        label_ids = sorted(label_ids[label_ids > 0])

        instance_rgbs, instance_masks, scene_rgbs = [], [], []
        for segment_id in label_ids:
            mask = np.zeros_like(seg_array, dtype=np.uint8)
            mask[seg_array == segment_id] = 255
            segment_rgb = np.ones_like(rgb_array) * 255
            segment_rgb[mask == 255] = rgb_array[mask == 255]
            instance_rgbs.append(Image.fromarray(segment_rgb))
            instance_masks.append(Image.fromarray(mask))
            scene_rgbs.append(rgb)

        with torch.no_grad():
            outputs = self.pipe(
                image=instance_rgbs,
                mask=instance_masks,
                image_scene=scene_rgbs,
                attention_kwargs={"num_instances": len(instance_rgbs)},
                num_inference_steps=steps,
                guidance_scale=7.0,
                decode_progressive=True,
                return_dict=False,
                generator=torch.Generator(device="cuda").manual_seed(seed),
            )

        meshes = []
        for logits_, grid_size, bbox_size, bbox_min, bbox_max in zip(*outputs):
            grid_logits = logits_.view(grid_size)
            grid_logits = smooth_gpu(grid_logits, method="gaussian", sigma=1)
            torch.cuda.empty_cache()
            vertices, faces, _, _ = measure.marching_cubes(
                grid_logits.float().cpu().numpy(), 0, method="lewiner"
            )
            vertices = vertices / grid_size * bbox_size + bbox_min
            meshes.append(trimesh.Trimesh(vertices.astype(np.float32), np.ascontiguousarray(faces)))

        scene = trimesh.Scene(meshes)
        glb = scene.export(file_type="glb")
        return {"glb_b64": base64.b64encode(glb).decode(), "num_instances": len(meshes)}
