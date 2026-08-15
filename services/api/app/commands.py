"""Natural language -> validated SceneEditCommand list.

The LLM only ever emits operations from a fixed vocabulary; every operation
is validated against the live scene before it reaches the client, so the
model can never mutate arbitrary application state.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from providers import get_provider  # noqa: E402

OPERATIONS = [
    "move",          # params: delta [dx,dy,dz] m OR position [x,y,z]
    "rotate",        # params: degrees (about Y)
    "scale",         # params: factor OR dimensions {width,height,depth} m
    "set_material",  # params: material {type: solid|pattern, color, pattern, secondaryColor}
    "hide", "show", "duplicate", "delete", "reset",
    "replace",       # params: query (search for alternatives)
    "highlight",     # scene search answers: highlight matching objects
    "answer",        # params: text (pure question, no mutation)
]

COMMAND_SCHEMA = {
    "type": "object",
    "properties": {
        "commands": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "operation": {"type": "string", "enum": OPERATIONS},
                    "targetObjectIds": {"type": "array", "items": {"type": "string"}},
                    "params": {
                        "type": "object",
                        "properties": {
                            "delta": {"type": "array", "items": {"type": "number"}},
                            "position": {"type": "array", "items": {"type": "number"}},
                            "degrees": {"type": "number"},
                            "factor": {"type": "number"},
                            "dimensions": {
                                "type": "object",
                                "properties": {
                                    "width": {"type": "number"},
                                    "height": {"type": "number"},
                                    "depth": {"type": "number"},
                                },
                                "additionalProperties": False,
                            },
                            "material": {
                                "type": "object",
                                "properties": {
                                    "type": {"type": "string", "enum": ["original", "solid", "pattern"]},
                                    "color": {"type": "string"},
                                    "secondaryColor": {"type": "string"},
                                    "pattern": {"type": "string",
                                                "enum": ["zebra", "checker", "stripes", "wood", "dots"]},
                                    "roughness": {"type": "number"},
                                    "metallic": {"type": "number"},
                                },
                                "additionalProperties": False,
                            },
                            "query": {"type": "string"},
                            "text": {"type": "string"},
                        },
                        "additionalProperties": False,
                    },
                },
                "required": ["operation", "targetObjectIds", "params"],
                "additionalProperties": False,
            },
        },
        "assistantNote": {"type": "string",
                          "description": "One short sentence telling the user what was done"},
    },
    "required": ["commands", "assistantNote"],
    "additionalProperties": False,
}

SYSTEM = """You convert a user's natural-language request about a 3D scene into
scene edit commands. The scene uses meters, Y up, camera at origin looking down -Z
(so "left" is -X, "right" is +X, "forward/away from camera" is -Z, "closer/toward
camera" is +Z, "up" is +Y). Only use object ids that exist in the scene summary.
If the user refers to "this/that" object, prefer the selected object id.
For questions ("where is...", "which objects..."), use highlight with the matching
ids and an answer command with the text. Never invent operations."""


def parse(scene: dict, text: str, selected_id: str | None) -> dict:
    summary = {
        "mode": scene["mode"],
        "selectedObjectId": selected_id,
        "objects": [
            {
                "id": o["id"],
                "name": o["name"],
                "category": o["category"],
                "position": o["transform"]["position"],
                "dimensions": [o["dimensions"]["width"], o["dimensions"]["height"],
                               o["dimensions"]["depth"]],
                "hidden": o["state"]["hidden"],
                "colors": o["appearance"].get("dominantColors", []),
            }
            for o in scene["objects"]
        ],
    }
    result = get_provider().generate_structured(
        f"Scene summary:\n{summary}\n\nUser request: {text}",
        COMMAND_SCHEMA, system=SYSTEM,
    )
    return validate(scene, result)


def validate(scene: dict, result: dict) -> dict:
    """Drop commands referencing unknown objects or malformed params."""
    known = {o["id"] for o in scene["objects"]}
    valid = []
    for cmd in result.get("commands", []):
        if cmd["operation"] not in OPERATIONS:
            continue
        ids = [i for i in cmd.get("targetObjectIds", []) if i in known]
        if not ids and cmd["operation"] not in ("answer",):
            continue
        p = cmd.get("params", {})
        for vec_key in ("delta", "position"):
            if vec_key in p and len(p[vec_key]) != 3:
                p.pop(vec_key)
        # clamp deltas to keep single commands from teleporting objects
        if "delta" in p:
            p["delta"] = [max(-10, min(10, v)) for v in p["delta"]]
        if "factor" in p:
            p["factor"] = max(0.1, min(10, p["factor"]))
        cmd["targetObjectIds"] = ids
        valid.append(cmd)
    return {"commands": valid, "assistantNote": result.get("assistantNote", "Done.")}
