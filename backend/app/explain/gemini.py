"""One way to call Gemini: a shared client and a chain of models.

Models get busy (503), rate-limited (429) or retired for new keys (404); when that happens the
next model in the chain is tried at once. Any other error is raised, and every caller falls
back to AYU's built-in answers, so the app never waits on the network for long.
"""

from __future__ import annotations

import logging

from ..config import settings

log = logging.getLogger("ayu.gemini")
RETRY_CODES = {404, 429, 500, 503}
_clients: dict[int, object] = {}


def client(timeout_s: float):
    from google import genai
    from google.genai import types

    key = int(max(10.0, timeout_s) * 1000)  # the API rejects deadlines under 10 s; callers keep their own shorter wait
    if key not in _clients:
        _clients[key] = genai.Client(api_key=settings.gemini_api_key, http_options=types.HttpOptions(timeout=key))
    return _clients[key]


def generate(models: list[str], contents, config, timeout_s: float) -> tuple[str, str]:
    """→ (reply text, the model that answered). Raises the last error if every model fails."""
    last: Exception | None = None
    c = client(timeout_s)
    for model in models:
        try:
            reply = c.models.generate_content(model=model, contents=contents, config=config)
            return (reply.text or ""), model
        except Exception as e:  # noqa: BLE001 — classified below; anything unexpected is re-raised
            code = getattr(e, "code", None)
            if code in RETRY_CODES or "timeout" in type(e).__name__.lower():
                log.warning("gemini model %s unavailable (%s); trying the next one", model, code)
                last = e
                continue
            raise
    raise last or RuntimeError("no Gemini model configured")
