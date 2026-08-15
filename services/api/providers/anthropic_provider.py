"""Anthropic Claude provider."""
from __future__ import annotations

import json
import os

import anthropic

from .base import LLMProvider

MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-opus-5")


class AnthropicProvider(LLMProvider):
    name = "anthropic"

    def __init__(self) -> None:
        self.client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    def _content(self, prompt: str, image_b64: str | None):
        content: list = []
        if image_b64:
            content.append({"type": "image", "source": {
                "type": "base64", "media_type": "image/png", "data": image_b64}})
        content.append({"type": "text", "text": prompt})
        return content

    def generate_structured(self, prompt, schema, image_b64=None, system=None, max_tokens=2048):
        kwargs = {}
        if system:
            kwargs["system"] = system
        resp = self.client.messages.create(
            model=MODEL, max_tokens=max_tokens,
            output_config={"format": {"type": "json_schema", "schema": schema}},
            messages=[{"role": "user", "content": self._content(prompt, image_b64)}],
            **kwargs,
        )
        text = next(b.text for b in resp.content if b.type == "text")
        return json.loads(text)

    def generate_structured_with_search(self, prompt, schema, max_tokens=8000):
        resp = self.client.messages.create(
            model=MODEL, max_tokens=max_tokens,
            tools=[{"type": "web_search_20260209", "name": "web_search", "max_uses": 6}],
            output_config={"format": {"type": "json_schema", "schema": schema}},
            messages=[{"role": "user", "content": prompt}],
        )
        if resp.stop_reason == "refusal":
            return {}
        text = "{}"
        for b in reversed(resp.content):
            if b.type == "text" and b.text.strip().startswith("{"):
                text = b.text
                break
        return json.loads(text)

    def reason(self, prompt, system=None, max_tokens=1024):
        kwargs = {"system": system} if system else {}
        resp = self.client.messages.create(
            model=MODEL, max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}], **kwargs,
        )
        return next(b.text for b in resp.content if b.type == "text")
