"""Hunyuan3D-2 on Modal: one object image -> photorealistic TEXTURED 3D model (GLB).

Standalone service ("on the side") — each detected object's crop goes in, a
textured GLB comes out. Connect to the plop frontend later.

Deploy:  modal deploy modal_app/hunyuan_app.py
Call:    POST <url>  {"image_b64": ...}
         -> {"glb_b64": ...}
"""
import base64
import io

import modal

app = modal.App("plop-hunyuan3d")

REPO_DIR = "/root/Hunyuan3D-2"

image = (
    modal.Image.from_registry("nvidia/cuda:12.1.1-devel-ubuntu22.04", add_python="3.11")
    .env({"CUDA_HOME": "/usr/local/cuda"})
    .apt_install("git", "libgl1", "libglib2.0-0", "libgomp1", "libegl1",
                 "libxrender1", "build-essential", "clang")
    .pip_install(
        "torch==2.4.0",
        "torchvision==0.19.0",
        index_url="https://download.pytorch.org/whl/cu121",
    )
    .pip_install(
        "ninja", "pybind11", "diffusers==0.32.2", "einops",
        "opencv-python-headless", "numpy<2", "transformers==4.49.0",
        "omegaconf", "tqdm", "trimesh", "pymeshlab", "pygltflib", "xatlas",
        "accelerate", "rembg", "onnxruntime", "huggingface_hub",
        "fastapi[standard]", "scikit-image",
    )
    .run_commands(
        f"git clone --depth 1 https://github.com/Tencent-Hunyuan/Hunyuan3D-2 {REPO_DIR}",
        f"cd {REPO_DIR} && pip install -e .",
    )
    # CUDA extensions for the texture painter — built against L40S (Ada, sm_89)
    .run_commands(
        f"cd {REPO_DIR}/hy3dgen/texgen/custom_rasterizer && "
        "TORCH_CUDA_ARCH_LIST='8.9' python3 setup.py install",
        f"cd {REPO_DIR}/hy3dgen/texgen/differentiable_renderer && "
        "TORCH_CUDA_ARCH_LIST='8.9' python3 setup.py install",
        gpu="L40S",
    )
    .env({"HF_HOME": "/weights/hf"})
)

weights = modal.Volume.from_name("plop-hunyuan-weights", create_if_missing=True)


@app.cls(
    image=image,
    gpu="L40S",
    volumes={"/weights": weights},
    timeout=900,
    scaledown_window=300,
)
class Hunyuan3D:
    @modal.enter()
    def load(self):
        import sys
        sys.path.insert(0, REPO_DIR)
        import torch  # noqa: F401
        from hy3dgen.rembg import BackgroundRemover
        from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
        from hy3dgen.texgen import Hunyuan3DPaintPipeline

        self.rembg = BackgroundRemover()
        self.shapegen = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
            "tencent/Hunyuan3D-2", subfolder="hunyuan3d-dit-v2-0-turbo",
            variant="fp16",
        )
        self.texgen = Hunyuan3DPaintPipeline.from_pretrained("tencent/Hunyuan3D-2")
        weights.commit()

    @modal.fastapi_endpoint(method="POST")
    def generate(self, payload: dict):
        from PIL import Image

        img = Image.open(io.BytesIO(base64.b64decode(payload["image_b64"])))
        if img.mode == "RGB":
            img = self.rembg(img)
        else:
            img = img.convert("RGBA")

        mesh = self.shapegen(
            image=img,
            num_inference_steps=int(payload.get("steps", 30)),
            octree_resolution=int(payload.get("octree_resolution", 380)),
        )[0]
        if payload.get("texture", True):
            mesh = self.texgen(mesh, image=img)

        buf = io.BytesIO()
        mesh.export(buf, file_type="glb")
        return {"glb_b64": base64.b64encode(buf.getvalue()).decode()}
