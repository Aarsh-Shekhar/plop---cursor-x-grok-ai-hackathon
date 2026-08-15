"""LLM provider abstraction.

The active provider is chosen by env: XAI_API_KEY -> Grok (hackathon
primary), else ANTHROPIC_API_KEY -> Claude. Both implement the same
interface, so product code never imports a vendor SDK directly.
"""
from __future__ import annotations

import os


_provider = None


def get_provider():
    global _provider
    if _provider is None:
        if os.environ.get("XAI_API_KEY"):
            from .grok import GrokProvider
            _provider = GrokProvider()
        elif os.environ.get("ANTHROPIC_API_KEY"):
            from .anthropic_provider import AnthropicProvider
            _provider = AnthropicProvider()
        else:
            raise RuntimeError(
                "No LLM provider configured. Set XAI_API_KEY or ANTHROPIC_API_KEY "
                "in services/api/.env"
            )
    return _provider
