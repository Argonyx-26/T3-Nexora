from datetime import timedelta

import pytest

from app.risk import assess
from app.risk.types import Dose, PatientContext, SymptomEntry

from .factories import T0, history, reading


def ctx(readings, **kw):
    return PatientContext(patient_id="P-test", history=readings, **kw)


def total(result):
    return sum(f.contribution for f in result.factors)


def test_stable_patient_is_stable():
    r = assess(ctx(history(7 * 24)))
    assert r.level == "Stable"
    assert r.score < 25
    assert r.urgency == "Routine"


@pytest.mark.parametrize("seed", range(10))
def test_resting_patients_never_raise_false_alarms(seed):
    assert assess(ctx(history(7 * 24, seed=seed))).level == "Stable"


def test_factors_add_up_to_the_score():
    def sepsis(h, v):
        k = max(0, 4 - h)
        v.update(hr=v["hr"] + 8 * k, temp=v["temp"] + 0.4 * k, rr=v["rr"] + 1.5 * k, sbp=v["sbp"] - 5 * k)
        return v

    r = assess(ctx(history(7 * 24, change=sepsis)))
    assert r.factors
    assert total(r) == pytest.approx(r.score, abs=1.0)
    assert r.factors == sorted(r.factors, key=lambda f: -f.contribution)


def test_hypoxic_drift_is_caught_while_news2_is_still_low():
    """The pitch: SpO2 sliding within the 'normal' range. NEWS2 stays Low; AYU escalates."""

    def hypoxia(h, v):
        k = max(0, 3 - h)
        v.update(spo2=v["spo2"] - 1.0 * k, rr=v["rr"] + 1.0 * k, hr=v["hr"] + 4 * k)
        return v

    r = assess(ctx(history(7 * 24, change=hypoxia)))
    assert r.news2.band == "Low"
    assert r.level in ("Watch", "Warning")
    kinds = {f.factor for f in r.factors}
    assert "spo2_trend" in kinds
    assert any("NEWS2 still scores this as normal" in f.message for f in r.factors)


def test_same_bp_means_different_things_for_different_patients():
    hypertensive = history(7 * 24, base={"sbp": 150})
    normotensive = history(7 * 24, change=lambda h, v: {**v, "sbp": 150} if h < 0.5 else v)
    a = assess(ctx(hypertensive))
    b = assess(ctx(normotensive))
    assert a.news2.parameters["sbp"] == b.news2.parameters["sbp"] == 0
    assert "sbp_baseline" not in {f.factor for f in a.factors}
    assert "sbp_baseline" in {f.factor for f in b.factors}


def test_news2_high_forces_critical():
    h = history(24)
    h.append(reading(ts=T0 + timedelta(minutes=5), rr=26, spo2=90, hr=115))  # 3 + 3 + 2 = 8
    r = assess(ctx(h))
    assert r.news2.total >= 7
    assert r.level == "Critical"
    assert r.urgency == "Immediate"
    assert total(r) == pytest.approx(r.score, abs=1.0)


def test_red_flag_symptom_escalates_to_critical():
    r = assess(ctx(history(7 * 24), symptoms=[SymptomEntry(T0 - timedelta(minutes=10), "chest_pain")]))
    assert r.level == "Critical"
    assert any(f.kind == "escalation" for f in r.factors)
    assert any("chest pain" in a for a in r.recommended_action)


def test_qsofa_flag_is_at_least_warning():
    h = history(24)
    h.append(reading(ts=T0 + timedelta(minutes=5), rr=23, sbp=99))
    r = assess(ctx(h))
    assert r.qsofa.flag
    assert r.score >= 50


def test_missed_critical_dose_adds_risk():
    doses = [Dose("Insulin glargine", T0 - timedelta(hours=3), "missed", critical=True)]
    r = assess(ctx(history(7 * 24), doses=doses))
    assert any(f.kind == "medication" for f in r.factors)
    assert any("Insulin glargine" in a for a in r.recommended_action)


def test_score_is_bounded():
    h = history(7 * 24, change=lambda hh, v: {**v, "spo2": 80, "rr": 35, "hr": 150, "sbp": 80, "temp": 40} if hh < 3 else v)
    syms = [SymptomEntry(T0, k) for k in ("chest_pain", "confusion", "breathlessness", "fainting")]
    r = assess(ctx(h, symptoms=syms))
    assert 0 <= r.score <= 100
    assert r.level == "Critical"


def test_declared_normals_used_for_a_new_patient():
    r = assess(ctx(history(1), declared_normals={"hr": (72.0, 4.0)}))
    assert r.baselines["hr"].source == "declared"


def test_copd_patient_on_scale2_is_not_a_permanent_alarm():
    copd = history(7 * 24, base={"spo2": 89.5, "rr": 19})
    assert assess(ctx(copd, spo2_scale=1)).news2.parameters["spo2"] == 3
    assert assess(ctx(copd, spo2_scale=2)).level == "Stable"
