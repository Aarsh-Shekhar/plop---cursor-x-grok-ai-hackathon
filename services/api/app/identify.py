"""Object identification + shopping via the provider abstraction.

Consumer: name, style, materials, dimensions, shopping query.
Founder: manufacturer/model hypothesis with an explicit confidence — an
uncertain identification is never presented as confirmed.
"""
from __future__ import annotations

import base64
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from providers import get_provider  # noqa: E402

from . import store  # noqa: E402

IDENTIFY_SCHEMA = {
    "type": "object",
    "properties": {
        "product_name": {"type": "string"},
        "category": {"type": "string"},
        "style": {"type": "string"},
        "materials": {"type": "array", "items": {"type": "string"}},
        "colors": {"type": "array", "items": {"type": "string"}},
        "est_width_cm": {"type": "integer"},
        "est_height_cm": {"type": "integer"},
        "est_depth_cm": {"type": "integer"},
        "search_query": {"type": "string"},
    },
    "required": ["product_name", "category", "style", "materials", "colors",
                 "est_width_cm", "est_height_cm", "est_depth_cm", "search_query"],
    "additionalProperties": False,
}

HARDWARE_SCHEMA = {
    "type": "object",
    "properties": {
        "component_name": {"type": "string"},
        "component_type": {"type": "string"},
        "likely_manufacturer": {"type": ["string", "null"]},
        "likely_model": {"type": ["string", "null"]},
        "identification_confidence": {"type": "number",
                                      "description": "0-1; below 0.8 must be shown as unconfirmed"},
        "readable_text": {"type": "array", "items": {"type": "string"}},
        "est_power_w": {"type": ["number", "null"]},
        "thermal_role": {"type": "string", "enum": ["heat-source", "cooling", "passive", "unknown"]},
        "connectors": {"type": "array", "items": {"type": "string"}},
        "est_width_cm": {"type": "integer"},
        "est_height_cm": {"type": "integer"},
        "est_depth_cm": {"type": "integer"},
        "search_query": {"type": "string"},
        "notes": {"type": "string"},
    },
    "required": ["component_name", "component_type", "likely_manufacturer", "likely_model",
                 "identification_confidence", "readable_text", "est_power_w", "thermal_role",
                 "connectors", "est_width_cm", "est_height_cm", "est_depth_cm",
                 "search_query", "notes"],
    "additionalProperties": False,
}

SHOP_SCHEMA = {
    "type": "object",
    "properties": {
        "listings": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "price_usd": {"type": "number"},
                    "url": {"type": "string"},
                    "source": {"type": "string"},
                    "rating": {"type": ["number", "null"]},
                    "width_cm": {"type": ["number", "null"]},
                    "height_cm": {"type": ["number", "null"]},
                    "depth_cm": {"type": ["number", "null"]},
                    "why": {"type": "string"},
                },
                "required": ["title", "price_usd", "url", "source", "rating",
                             "width_cm", "height_cm", "depth_cm", "why"],
                "additionalProperties": False,
            },
        },
        "best_pick_index": {"type": "integer"},
        "notes": {"type": "string"},
    },
    "required": ["listings", "best_pick_index", "notes"],
    "additionalProperties": False,
}


def _cutout_b64(scene_id: str, obj: dict) -> str:
    filename = obj["geometry"]["textureUri"].split("/")[-1]
    path = store.artifact_dir(scene_id) / filename
    img = Image.open(path).convert("RGB")
    img.thumbnail((512, 512), Image.LANCZOS)
    import io
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def identify_object(scene: dict, obj: dict) -> dict:
    b64 = _cutout_b64(scene["id"], obj)
    dims = obj["dimensions"]
    hint = (f"Depth-based size estimate (rough): ~{dims['width']}m wide x "
            f"~{dims['height']}m tall.")
    if scene["mode"] == "founder":
        return get_provider().generate_structured(
            f"This is a '{obj['label']}' component in a photo of a hardware system. {hint} "
            "Identify it technically. Read any visible text/logos. Give your best "
            "manufacturer/model hypothesis with an honest identification_confidence "
            "(0-1). Estimate power draw and thermal role. List likely connectors. "
            "Give realistic dimensions in cm and the best search query for finding "
            "this component or its datasheet.",
            HARDWARE_SCHEMA, image_b64=b64, max_tokens=1500,
        )
    return get_provider().generate_structured(
        f"This is a '{obj['label']}' detected in a photo of a room. {hint} "
        "Identify it as a purchasable product: name, category, style, materials, "
        "colors, realistic dimensions in cm, and the best shopping search query.",
        IDENTIFY_SCHEMA, image_b64=b64, max_tokens=1024,
    )


SCAN_SCHEMA = {
    "type": "object",
    "properties": {
        "found": {"type": "boolean"},
        "title": {"type": "string"},
        "price_usd": {"type": ["number", "null"]},
        "url": {"type": "string"},
        "rating": {"type": ["number", "null"]},
        "reviews_summary": {"type": "string"},
        "match_confidence": {"type": "number",
                             "description": "0-1 how well this matches the requested item"},
        "width_cm": {"type": ["number", "null"]},
        "height_cm": {"type": ["number", "null"]},
        "depth_cm": {"type": ["number", "null"]},
        "note": {"type": "string", "description": "One line on what was found or why nothing matched"},
    },
    "required": ["found", "title", "price_usd", "url", "rating", "reviews_summary",
                 "match_confidence", "width_cm", "height_cm", "depth_cm", "note"],
    "additionalProperties": False,
}


def scan_retailer(query: str, retailer: str, domain: str) -> dict:
    """One hive worker: scan a single retailer for the item (domain-locked
    web search). Ported from the team's item-finder agent."""
    result = get_provider().generate_structured_with_search(
        f"Search {retailer} ({domain}) for this item: {query}. "
        "Find the single best matching product currently sold there. Report its exact "
        "title, current price in USD, direct product URL, star rating if visible, a "
        "one-line review summary, product dimensions in cm when listed, and how "
        "confident you are it matches (0-1). "
        "Prices and ratings usually appear right in the search result snippets — read "
        "them from there; do not spend searches re-verifying. An approximate price from "
        "a snippet is better than a null price. "
        "If nothing close is sold there, set found=false and explain in note.",
        SCAN_SCHEMA, max_tokens=4500, allowed_domains=[domain],
    )
    if not result:
        return {"found": False, "title": "", "price_usd": None, "url": "", "rating": None,
                "reviews_summary": "", "match_confidence": 0,
                "width_cm": None, "height_cm": None, "depth_cm": None,
                "note": "search declined"}
    return result


def shop(query: str, context: str = "", max_results: int = 6) -> dict:
    result = get_provider().generate_structured_with_search(
        f"Find up to {max_results} current online listings to buy: {query}. {context} "
        "For each: exact title, current price USD, direct product URL, retailer, "
        "star rating if visible, product dimensions in cm when listed, and why it "
        "matches. Prefer real prices and reputable retailers. Pick the best value.",
        SHOP_SCHEMA,
    )
    if not result:
        return {"listings": [], "best_pick_index": 0, "notes": "Search was declined; try a different query."}
    return result
