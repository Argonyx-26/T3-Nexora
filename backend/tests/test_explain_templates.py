import re
from datetime import timedelta

import pytest

from app.explain.templates import factor_hi, template_explanation
from app.risk import assess
from app.risk.types import Dose, PatientContext, SymptomEntry

from .factories import T0, history, reading

DEVANAGARI = re.compile(r"[ऀ-ॿ]")


def ctx(readings, **kw):
    return PatientContext(patient_id="P-test", history=readings, **kw)


def hypoxic():
    def drift(h, v):
        k = max(0, 3 - h)
        v.update(spo2=v["spo2"] - 1.4 * k, rr=v["rr"] + 1.2 * k, hr=v["hr"] + 5 * k)
        return v

    return assess(ctx(history(7 * 24, change=drift)))


def test_stable_patient_reads_calm_in_both_languages():
    r = assess(ctx(history(7 * 24)))
    en = template_explanation(r, "en")
    hi = template_explanation(r, "hi")
    assert "own normal range" in en["doctor"]
    assert en["urgency"] == "Routine"
    assert DEVANAGARI.search(hi["doctor"]) and DEVANAGARI.search(hi["patient"])
    assert hi["urgency"] == "नियमित"


def test_english_names_causes_score_and_urgency():
    r = hypoxic()
    e = template_explanation(r, "en")
    assert f"AYU {r.score}/100" in e["doctor"]
    assert f"Urgency: {r.urgency}." in e["doctor"]
    assert "SpO₂" in e["doctor"]
    assert "Escalation rule" not in e["doctor"]


def test_ayu_ahead_of_news2_is_called_out():
    r = hypoxic()
    if r.level in ("Warning", "Critical") and r.news2.total < 5 and not r.news2.any_three:
        assert "threshold-only" in template_explanation(r, "en")["doctor"]


@pytest.mark.parametrize("lang", ["en", "hi"])
def test_every_factor_kind_explains_without_error(lang):
    h = history(24)
    h.append(reading(ts=T0 + timedelta(minutes=5), rr=24, sbp=98, temp=38.6, hr=118))  # qSOFA + NEWS2
    doses = [Dose("Insulin glargine", T0 - timedelta(hours=3), "missed", critical=True)] + [
        Dose("Metformin", T0 - timedelta(hours=12 * i), "missed") for i in range(1, 8)
    ]
    syms = [SymptomEntry(T0, "chest_pain"), SymptomEntry(T0, "breathlessness")]
    r = assess(ctx(h, doses=doses, symptoms=syms))
    kinds = {f.kind for f in r.factors}
    assert {"news2", "qsofa", "medication", "adherence", "symptom"} <= kinds
    for f in r.factors:
        text = factor_hi(f) if lang == "hi" else f.message
        assert text.strip()
        if lang == "hi":
            assert DEVANAGARI.search(text), f.factor
    out = template_explanation(r, lang)
    assert out["doctor"] and out["patient"] and out["urgency"]


def test_hindi_symptom_and_medicine_sentences():
    doses = [Dose("Insulin glargine", T0 - timedelta(hours=3), "missed", critical=True)]
    r = assess(ctx(history(7 * 24), doses=doses, symptoms=[SymptomEntry(T0, "chest_pain")]))
    hi = {f.kind: factor_hi(f) for f in r.factors}
    assert "सीने में दर्द" in hi["symptom"]
    assert "Insulin glargine" in hi["medication"]
