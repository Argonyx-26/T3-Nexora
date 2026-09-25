"""Explanations for a risk score: Gemini when it is configured and answers well, the
built-in templates otherwise. The demo never waits on the network:

- Gemini gets only the score, level, urgency and contributing factors — never the
  patient's name, age, bed or any other identifier.
- Each call has a hard timeout (GEMINI_TIMEOUT_S, default 4 s).
- The reply must be JSON with doctor / patient / urgency text (Devanagari for Hindi),
  or it is discarded.
- After a failure Gemini is skipped for a minute, so a dropped network costs one
  timeout, not one per click.
- Good answers are cached per patient, language and risk picture.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from datetime import datetime

from ..config import settings
from ..risk import RiskResult
from .templates import template_explanation

log = logging.getLogger("ayu.explain")

CACHE_TTL_S = 600
COOLDOWN_AFTER_FAILURE_S = 60
MAX_CHARS = 900
DEVANAGARI = re.compile(r"[ऀ-ॿ]")

SYSTEM_PROMPT = """You are the explanation layer of AYU, a clinical decision-support tool on a hospital ward.
You receive the contributing factors behind one patient's early-warning risk score. You never see who the patient is.

Rules:
- Explain in 2-3 short sentences for a doctor, then 1 sentence for the patient in simple language.
- Do not diagnose. Do not name a disease as certain; describe what the readings show.
- Suggest the urgency of review, consistent with the urgency you are given.
- Use only the facts provided. Never invent numbers.
- Reply with JSON only: {"doctor": "...", "patient": "...", "urgency": "..."}
- Write all three values in LANGUAGE."""

LANGUAGE = {"en": "English", "hi": "Hindi, in Devanagari script (keep numbers, units and terms like NEWS2, qSOFA, SpO₂ as they are)"}


def build_payload(risk: RiskResult) -> dict:
    """Everything Gemini sees. No identifiers: this is the privacy boundary."""
    return {
        "level": risk.level,
        "score": risk.score,
        "urgency": risk.urgency,
        "news2": {"total": risk.news2.total, "band": risk.news2.band},
        "qsofa": {"score": risk.qsofa.score, "sepsis_flag": risk.qsofa.flag},
        "factors": [
            {"factor": f.factor, "kind": f.kind, "detail": f.message, "points": f.contribution}
            for f in risk.factors[:6]
        ],
    }


def parse_reply(raw: str, lang: str) -> dict | None:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(data, dict):
        return None
    out = {}
    for key in ("doctor", "patient", "urgency"):
        value = data.get(key)
        if not isinstance(value, str) or not value.strip() or len(value) > MAX_CHARS:
            return None
        out[key] = value.strip()
    if lang == "hi" and not (DEVANAGARI.search(out["doctor"]) and DEVANAGARI.search(out["patient"])):
        return None
    return out


class Explainer:
    def __init__(self) -> None:
        self._client = None
        self._cache: dict[tuple, tuple[float, dict]] = {}
        self._skip_until = 0.0

    def _key(self, patient_id: str, risk: RiskResult, lang: str) -> tuple:
        return (patient_id, lang, risk.level, risk.score // 5, tuple(f.factor for f in risk.factors[:3]))

    def _call_gemini(self, risk: RiskResult, lang: str) -> str:
        from google import genai
        from google.genai import types

        if self._client is None:
            self._client = genai.Client(
                api_key=settings.gemini_api_key,
                http_options=types.HttpOptions(timeout=int(settings.gemini_timeout_s * 1000)),
            )
        config = types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT.replace("LANGUAGE", LANGUAGE[lang]),
            response_mime_type="application/json",
            temperature=0.2,
            max_output_tokens=600,
            thinking_config=types.ThinkingConfig(thinking_budget=0),  # latency matters more than depth here
        )
        reply = self._client.models.generate_content(
            model=settings.gemini_model,
            contents=json.dumps(build_payload(risk), ensure_ascii=False),
            config=config,
        )
        return reply.text or ""

    async def explain(self, patient_id: str, risk: RiskResult, lang: str, now: datetime) -> dict:
        lang = "hi" if lang == "hi" else "en"
        base = {"level": risk.level, "score": risk.score, "lang": lang, "generated_at": now}
        key = self._key(patient_id, risk, lang)
        hit = self._cache.get(key)
        if hit and time.monotonic() - hit[0] < CACHE_TTL_S:
            return {**base, **hit[1]}

        if settings.gemini_api_key and time.monotonic() >= self._skip_until:
            try:
                raw = await asyncio.wait_for(asyncio.to_thread(self._call_gemini, risk, lang), timeout=settings.gemini_timeout_s)
                parsed = parse_reply(raw, lang)
                if parsed:
                    result = {**parsed, "source": "gemini", "model": settings.gemini_model}
                    self._cache[key] = (time.monotonic(), result)
                    return {**base, **result}
                log.warning("gemini reply failed validation; using the template")
            except Exception as e:  # timeout, network, quota, bad model name: all fall back
                log.warning("gemini unavailable (%s); using templates for %ss", type(e).__name__, COOLDOWN_AFTER_FAILURE_S)
                self._skip_until = time.monotonic() + COOLDOWN_AFTER_FAILURE_S

        return {**base, **template_explanation(risk, lang), "source": "template", "model": None}


explainer = Explainer()
