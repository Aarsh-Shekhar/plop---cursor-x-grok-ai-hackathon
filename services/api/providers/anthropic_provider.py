"""Anthropic Claude provider."""
from __future__ import annotations

import json
import os

import anthropic

from .base import LLMProvider

MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-opus-5")


def _text_of(resp) -> str:
    """All text blocks joined. The model may emit thinking blocks first; if
    max_tokens is exhausted before any text, fail with a clear error instead
    of StopIteration."""
    parts = [b.text for b in resp.content if b.type == "text" and b.text.strip()]
    if not parts:
        raise RuntimeError(
            f"model returned no text (stop_reason={resp.stop_reason}; "
            "likely max_tokens exhausted by thinking)")
    return "\n".join(parts)


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
            model=MODEL, max_tokens=max(max_tokens, 3000),
            output_config={"format": {"type": "json_schema", "schema": schema}},
            messages=[{"role": "user", "content": self._content(prompt, image_b64)}],
            **kwargs,
        )
        text = _text_of(resp)
        # schema-formatted JSON is the last text block that parses
        for cand in reversed([b.text for b in resp.content if b.type == "text"]):
            if cand.strip().startswith("{"):
                return json.loads(cand)
        return json.loads(text)

    def generate_structured_with_search(self, prompt, schema, max_tokens=8000,
                                        allowed_domains=None):
        tool: dict = {"type": "web_search_20260209", "name": "web_search", "max_uses": 6}
        if allowed_domains:
            tool["allowed_domains"] = allowed_domains
            tool["max_uses"] = 5
        resp = self.client.messages.create(
            model=MODEL, max_tokens=max_tokens,
            tools=[tool],
            output_config={"format": {"type": "json_schema", "schema": schema}},
            messages=[{"role": "user", "content": prompt}],
        )
        if resp.stop_reason == "refusal":
            return {}
        for b in reversed(resp.content):
            if b.type == "text" and b.text.strip().startswith("{"):
                return json.loads(b.text)
        raise RuntimeError(
            f"search call produced no JSON (stop_reason={resp.stop_reason}) — "
            "raise max_tokens")

    def reason(self, prompt, system=None, max_tokens=1024):
        kwargs = {"system": system} if system else {}
        resp = self.client.messages.create(
            model=MODEL, max_tokens=max(max_tokens, 2000),
            messages=[{"role": "user", "content": prompt}], **kwargs,
        )
        return _text_of(resp)
