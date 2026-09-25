from datetime import timedelta

import pytest

from app.risk import weights as W
from app.risk.baseline import baseline_for, current_value, deviation, robust_baseline
from app.risk.types import Baseline

from .factories import T0, history


def test_robust_baseline_ignores_outliers():
    values = [72.0] * 50 + [71.0] * 25 + [73.0] * 25 + [160.0, 170.0]  # two artefact spikes
    b = robust_baseline(values, min_std=1.0)
    assert b.mean == 72.0
    assert b.std == pytest.approx(1.4826, rel=1e-3)


def test_std_floor_stops_tiny_spread_inflating_z():
    b = robust_baseline([97.0] * 100, min_std=W.BASELINE_MIN_STD["spo2"])
    assert b.std == W.BASELINE_MIN_STD["spo2"]


def test_baseline_learns_this_patients_normal():
    hypertensive = history(48, base={"sbp": 150})
    b = baseline_for(hypertensive, "sbp", T0)
    assert b.source == "history"
    assert b.mean == pytest.approx(150, abs=2)


def test_recent_hours_are_excluded_so_drift_cannot_become_normal():
    def fever_last_5h(h, v):
        if h < 5:
            v["temp"] = 39.0
        return v

    b = baseline_for(history(48, change=fever_last_5h), "temp", T0)
    assert b.mean == pytest.approx(36.8, abs=0.1)


def test_short_history_falls_back_to_declared_normals():
    b = baseline_for(history(3), "hr", T0, declared=(55.0, 4.0))
    assert b.source == "declared"
    assert (b.mean, b.std) == (55.0, 4.0)
    assert baseline_for(history(3), "hr", T0) is None


def test_current_value_smooths_last_three_readings():
    h = history(1, noise=False)
    h[-1] = h[-1].__class__(**{**h[-1].__dict__, "hr": 90.0})
    assert current_value(h, "hr") == pytest.approx((72 + 72 + 90) / 3)


def test_z_score_and_flag():
    b = Baseline(mean=72, std=4, n=100, source="history")
    assert deviation("hr", 80, b).z == pytest.approx(2.0)
    assert not deviation("hr", 80, b).flagged
    assert deviation("hr", 82, b).flagged  # z = 2.5


def test_percent_rule_flags_a_large_relative_change():
    wide = Baseline(mean=50, std=20, n=100, source="history")
    d = deviation("hr", 61, wide)  # z = 0.55 but +22%
    assert abs(d.z) < W.Z_THRESHOLD
    assert d.flagged


def test_only_the_concerning_direction_is_flagged():
    b = Baseline(mean=95, std=1, n=100, source="history")
    assert not deviation("spo2", 99, b).flagged  # higher SpO2 is not a problem
    assert deviation("spo2", 92, b).flagged


def test_athlete_rise_is_caught_though_news2_calls_it_normal():
    athlete = history(48, base={"hr": 52})
    b = baseline_for(athlete, "hr", T0 + timedelta(minutes=5))
    d = deviation("hr", 78, b)  # NEWS2 scores HR 78 as 0
    assert d.flagged and d.z > 2.5
