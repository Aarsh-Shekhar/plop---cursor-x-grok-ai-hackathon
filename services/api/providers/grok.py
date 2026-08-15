"""xAI Grok provider (OpenAI-compatible chat API with structured outputs).

Primary provider for the Cursor/Grok hackathon build when XAI_API_KEY is set:
scene command parsing, object identification and scene search all route
through Grok; Anthropic acts as the fallback provider.
"""
from __future__ import annotations

import json
import os

import httpx

from .base import LLMProvider

BASE_URL = os.environ.get("XAI_BASE_URL", "https://api.x.ai/v1")
MODEL = os.environ.get("XAI_MODEL", "grok-4")


class GrokProvider(LLMProvider):
    name = "grok"

    def __init__(self) -> None:
        self.key = os.environ["XAI_API_KEY"]
        self.http = httpx.Client(
            base_url=BASE_URL, timeout=120,
            headers={"Authorization": f"Bearer {self.key}"},
        )

    def _chat(self, messages: list[dict], schema: dict | None, max_tokens: int,
              search: bool = False) -> str:
        body: dict = {"model": MODEL, "messages": messages, "max_tokens": max_tokens}
        if schema:
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "result", "schema": schema, "strict": True},
            }
        if search:
            # xAI Live Search — grounded web results
            body["search_parameters"] = {"mode": "auto"}
            if isinstance(search, list):  # domain-restricted (per-retailer workers)
                body["search_parameters"]["sources"] = [
                    {"type": "web", "allowed_websites": search[:5]}]
        r = self.http.post("/chat/completions", json=body)
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]

    def generate_structured(self, prompt, schema, image_b64=None, system=None, max_tokens=2048):
        content: list = []
        if image_b64:
            content.append({"type": "image_url", "image_url": {
                "url": f"data:image/png;base64,{image_b64}"}})
        content.append({"type": "text", "text": prompt})
        messages = ([{"role": "system", "content": system}] if system else []) + [
            {"role": "user", "content": content}]
        return json.loads(self._chat(messages, schema, max_tokens))

    def generate_structured_with_search(self, prompt, schema, max_tokens=8000,
                                        allowed_domains=None):
        messages = [{"role": "user", "content": prompt}]
        return json.loads(self._chat(messages, schema, max_tokens,
                                     search=allowed_domains or True))

    def reason(self, prompt, system=None, max_tokens=1024):
        messages = ([{"role": "system", "content": system}] if system else []) + [
            {"role": "user", "content": prompt}]
        return self._chat(messages, None, max_tokens)
