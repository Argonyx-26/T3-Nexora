from datetime import timedelta

from app.risk.adherence import adherence
from app.risk.symptoms import active_symptoms, red_flags
from app.risk.types import Dose, SymptomEntry

from .factories import T0


def _doses(pattern, critical=False, med="Insulin glargine"):
    # one dose per 12 h going back from T0, newest last
    n = len(pattern)
    return [
        Dose(medication=med, scheduled_at=T0 - timedelta(hours=12 * (n - i)), status=s, critical=critical)
        for i, s in enumerate(pattern)
    ]


def test_adherence_percent():
    r = adherence(_doses(["taken"] * 9 + ["missed"]), T0)
    assert r.pct == 90.0
    assert (r.taken, r.missed) == (9, 1)


def test_old_pending_counts_as_missed_but_recent_pending_does_not():
    doses = [
        Dose("Metformin", T0 - timedelta(hours=5), "pending"),
        Dose("Metformin", T0 - timedelta(minutes=30), "pending"),
    ]
    r = adherence(doses, T0)
    assert r.missed == 1 and r.taken == 0


def test_recent_missed_critical_dose_is_reported():
    r = adherence(_doses(["taken"] * 12 + ["missed"], critical=True), T0)
    assert len(r.missed_critical_recent) == 1


def test_no_doses_means_unknown_not_zero():
    assert adherence([], T0).pct is None


def test_active_symptoms_window_and_order():
    entries = [
        SymptomEntry(T0 - timedelta(hours=1), "cough"),
        SymptomEntry(T0 - timedelta(hours=2), "chest_pain"),
        SymptomEntry(T0 - timedelta(hours=30), "fainting"),  # too old
        SymptomEntry(T0, "not_a_symptom"),
    ]
    active = active_symptoms(entries, T0)
    assert active == ["chest_pain", "cough"]
    assert red_flags(active) == ["chest_pain"]
