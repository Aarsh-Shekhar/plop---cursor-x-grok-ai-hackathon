"""Shared provider interface: structured generation, vision, web-grounded search."""
from __future__ import annotations

from abc import ABC, abstractmethod


class LLMProvider(ABC):
    name: str = "base"

    @abstractmethod
    def generate_structured(self, prompt: str, schema: dict,
                            image_b64: str | None = None,
                            system: str | None = None,
                            max_tokens: int = 2048) -> dict:
        """Return a dict conforming to `schema`. May include one image."""

    @abstractmethod
    def generate_structured_with_search(self, prompt: str, schema: dict,
                                        max_tokens: int = 8000,
                                        allowed_domains: list[str] | None = None) -> dict:
        """Like generate_structured but with live web search available.
        allowed_domains restricts the search to specific sites (per-retailer
        swarm workers)."""

    @abstractmethod
    def reason(self, prompt: str, system: str | None = None,
               max_tokens: int = 1024) -> str:
        """Plain-text reasoning answer."""
