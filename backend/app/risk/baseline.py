"""Personal baseline: what is normal for *this* patient, and how far from it they are now.

The baseline is robust statistics (median, and MAD scaled to a standard deviation)
over the last 7 days, excluding the most recent hours. Median/MAD ignore the odd
outlier without needing to know which readings were "stable", and the lag stops a
slow deterioration from being absorbed into the baseline it is measured against.
"""

from __future__ import annotations

import statistics
from datetime import datetime, timedelta

from . import weights as W
from .types import Baseline, Deviation, Reading

MAD_TO_STD = 1.4826  # makes MAD a consistent estimator of σ for normal data


def robust_baseline(values: list[float], min_std: float) -> Baseline | None:
    if not values:
        return None
    med = statistics.median(values)
    mad = statistics.median(abs(v - med) for v in values)
    return Baseline(mean=med, std=max(mad * MAD_TO_STD, min_std), n=len(values), source="history")


def baseline_for(
    history: list[Reading],
    vital: str,
    now: datetime,
    declared: tuple[float, float] | None = None,
) -> Baseline | None:
    start = now - timedelta(hours=W.BASELINE_WINDOW_HOURS)
    end = now - timedelta(hours=W.BASELINE_LAG_HOURS)
    values = [v for r in history if start <= r.ts <= end and (v := r.get(vital)) is not None]
    min_std = W.BASELINE_MIN_STD[vital]
    if len(values) >= W.BASELINE_MIN_READINGS:
        return robust_baseline(values, min_std)
    if declared is not None:
        mean, std = declared
        return Baseline(mean=mean, std=max(std, min_std), n=0, source="declared")
    return None


def all_baselines(
    history: list[Reading], now: datetime, declared: dict[str, tuple[float, float]]
) -> dict[str, Baseline]:
    out = {}
    for vital in W.VITALS:
        b = baseline_for(history, vital, now, declared.get(vital))
        if b is not None:
            out[vital] = b
    return out


def current_value(history: list[Reading], vital: str, n: int = W.SMOOTH_READINGS) -> float | None:
    """Mean of the last n readings that have this vital, to damp single-reading noise."""
    values = []
    for r in reversed(history):
        v = r.get(vital)
        if v is not None:
            values.append(v)
            if len(values) == n:
                break
    return sum(values) / len(values) if values else None


def deviation(vital: str, value: float, baseline: Baseline) -> Deviation:
    z = (value - baseline.mean) / baseline.std
    pct = (value - baseline.mean) / baseline.mean if baseline.mean else 0.0
    direction = W.BAD_DIRECTION[vital]
    concerning = direction == "both" or (direction == "down" and z < 0) or (direction == "up" and z > 0)
    flagged = concerning and (abs(z) >= W.Z_THRESHOLD or abs(pct) >= W.PCT_THRESHOLD)
    return Deviation(vital=vital, value=value, baseline=baseline, z=z, pct=pct, flagged=flagged)
