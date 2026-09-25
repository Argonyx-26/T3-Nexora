"""The Gemini layer: privacy boundary, validation, timeout and fallback. Gemini itself is mocked."""

import asyncio
import dataclasses
import json
import time
from datetime import datetime

import pytest

from app.explain import service
from app.explain.service import Explainer, build_payload, parse_reply
from app.risk import assess
from app.risk.types import PatientContext

from .factories import history

NOW = datetime(2026, 9, 25, 12, 0)


def risk():
    def drift(h, v):
        k = max(0, 3 - h)
        v.update(spo2=v["spo2"] - 1.4 * k, rr=v["rr"] + 1.2 * k)
        return v

    return assess(PatientContext("P006", history(7 * 24, change=drift)))


@pytest.fixture()
def with_key(monkeypatch):
    monkeypatch.setattr(service, "settings", dataclasses.replace(service.settings, gemini_api_key="test-key", gemini_timeout_s=0.3))


def run(explainer, r, lang="en"):
    return asyncio.run(explainer.explain("P006", r, lang, NOW))


GOOD = json.dumps({"doctor": "SpO2 is sliding within range. Review within 1 hr.", "patient": "A doctor will see you soon.", "urgency": "Review within 1 hr"})


def test_payload_carries_no_identifiers():
    text = json.dumps(build_payload(risk()), ensure_ascii=False)
    for identifier in ("Priya", "Nair", "P006", "B-02", "Asthma"):
        assert identifier not in text
    assert "factors" in text


def test_parse_accepts_good_json_and_code_fences():
    assert parse_reply(GOOD, "en")["urgency"] == "Review within 1 hr"
    assert parse_reply(f"```json\n{GOOD}\n```", "en") is not None


@pytest.mark.parametrize("raw", ["not json", "[]", json.dumps({"doctor": "x"}), json.dumps({"doctor": "", "patient": "p", "urgency": "u"}),
                                 json.dumps({"doctor": "d" * 2000, "patient": "p", "urgency": "u"})])
def test_parse_rejects_bad_replies(raw):
    assert parse_reply(raw, "en") is None


def test_hindi_reply_must_be_in_devanagari():
    assert parse_reply(GOOD, "hi") is None
    hi = json.dumps({"doctor": "SpO₂ घट रहा है।", "patient": "डॉक्टर जल्द आएंगे।", "urgency": "1 घंटे के भीतर"})
    assert parse_reply(hi, "hi") is not None


def test_no_key_uses_templates():
    out = run(Explainer(), risk())
    assert out["source"] == "template" and out["model"] is None
    assert out["doctor"] and out["patient"]


def test_good_gemini_reply_is_used_and_cached(with_key, monkeypatch):
    ex = Explainer()
    calls = []
    monkeypatch.setattr(ex, "_call_gemini", lambda r, lang: calls.append(1) or GOOD)
    r = risk()
    assert run(ex, r)["source"] == "gemini"
    assert run(ex, r)["source"] == "gemini"
    assert len(calls) == 1


def test_invalid_reply_falls_back(with_key, monkeypatch):
    ex = Explainer()
    monkeypatch.setattr(ex, "_call_gemini", lambda r, lang: "sorry, I can't")
    assert run(ex, risk())["source"] == "template"


def test_slow_gemini_times_out_fast_and_then_is_skipped(with_key, monkeypatch):
    ex = Explainer()
    calls = []

    def slow(r, lang):
        calls.append(1)
        time.sleep(2)
        return GOOD

    monkeypatch.setattr(ex, "_call_gemini", slow)
    r = risk()

    async def timed():
        # Time the call inside the loop: asyncio.run() itself waits for the abandoned thread on exit.
        started = time.perf_counter()
        first = await ex.explain("P006", r, "en", NOW)
        elapsed = time.perf_counter() - started
        second = await ex.explain("P006", r, "hi", NOW)
        return first, elapsed, second

    first, elapsed, second = asyncio.run(timed())
    assert first["source"] == "template"
    assert elapsed < 1.0  # the 0.3 s timeout, not the 2 s call
    assert second["source"] == "template"
    assert len(calls) == 1  # skipped during the cool-down


def test_errors_fall_back(with_key, monkeypatch):
    ex = Explainer()

    def boom(r, lang):
        raise RuntimeError("quota exceeded")

    monkeypatch.setattr(ex, "_call_gemini", boom)
    out = run(ex, risk(), "hi")
    assert out["source"] == "template" and out["lang"] == "hi"
