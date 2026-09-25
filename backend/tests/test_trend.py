import pytest

from app.risk.trend import linear_fit, trend_for

from .factories import T0, history


def test_linear_fit_recovers_exact_slope():
    xs = [0, 1, 2, 3, 4]
    ys = [10, 8, 6, 4, 2]
    slope, intercept, se = linear_fit(xs, ys)
    assert slope == pytest.approx(-2)
    assert intercept == pytest.approx(10)
    assert se == pytest.approx(0)


def _spo2_falling(rate_per_hr):
    def change(h, v):
        v["spo2"] = v["spo2"] - rate_per_hr * max(0, 3 - h)  # drift started 3 h ago
        return v

    return change


def test_slow_spo2_fall_is_detected():
    t = trend_for(history(24, change=_spo2_falling(0.8)), "spo2", T0)
    assert t.flagged
    assert t.slope_per_hr == pytest.approx(-0.8, abs=0.25)


def test_flat_noisy_signal_is_not_a_trend():
    for seed in range(20):
        for vital in ("hr", "spo2", "sbp", "rr", "temp", "glucose"):
            t = trend_for(history(24, seed=seed), vital, T0)
            assert not t.flagged, (seed, vital, t)


def test_rising_spo2_is_not_flagged():
    t = trend_for(history(24, change=_spo2_falling(-0.8)), "spo2", T0)
    assert not t.flagged


def test_too_few_points_is_not_sustained():
    t = trend_for(history(0.5, change=_spo2_falling(3)), "spo2", T0)  # 7 readings
    assert t.n < 8
    assert not t.flagged


def test_fever_trend_is_detected():
    def fever(h, v):
        v["temp"] += 0.5 * max(0, 3 - h)
        return v

    t = trend_for(history(24, change=fever), "temp", T0)
    assert t.flagged and t.slope_per_hr > 0
