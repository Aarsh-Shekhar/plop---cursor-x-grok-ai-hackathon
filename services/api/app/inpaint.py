"""Object removal: LaMa inpainting (with OpenCV Telea as fallback)."""
import cv2
import numpy as np
from PIL import Image

_lama = None


def _get_lama():
    global _lama
    if _lama is None:
        from simple_lama_inpainting import SimpleLama
        _lama = SimpleLama(device="cpu")
    return _lama


def remove_object(image: Image.Image, mask: Image.Image, dilate_px: int = 15) -> Image.Image:
    """Remove the masked region and plausibly fill the hole."""
    image = image.convert("RGB")
    mask_arr = np.array(mask.convert("L").resize(image.size, Image.NEAREST))
    mask_arr = (mask_arr > 127).astype(np.uint8) * 255
    if dilate_px > 0:
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (dilate_px, dilate_px))
        mask_arr = cv2.dilate(mask_arr, kernel)
    try:
        result = _get_lama()(image, Image.fromarray(mask_arr, mode="L"))
        return result.convert("RGB").resize(image.size)
    except Exception:
        # degraded but never-failing fallback
        out = cv2.inpaint(
            cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR),
            mask_arr, inpaintRadius=7, flags=cv2.INPAINT_TELEA,
        )
        return Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB))
