"""Trend detection: a least-squares slope over a sliding window.

A drift is flagged only when the slope is steep enough (per-vital threshold, in the
concerning direction) AND sustained — at least TREND_MIN_T standard errors from zero —
so a couple of noisy readings can't fake a trend.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta

from . import weights as W
from .types import Reading, Trend


def linear_fit(xs: list[float], ys: list[float]) -> tuple[float, float, float]:
    """Returns (slope, intercept, standard error of the slope).

    Vitals taken minutes apart are autocorrelated, which makes the ordinary standard
    error far too small (a resting patient "trends" all the time). The error is widened
    by the lag-1 autocorrelation r of the residuals: se × √((1 + r) / (1 − r)).
    """
    n = len(xs)
    mx = sum(xs) / n
    my = sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx == 0:
        return 0.0, my, math.inf
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    intercept = my - slope * mx
    if n <= 2:
        return slope, intercept, math.inf
    res = [y - (intercept + slope * x) for x, y in zip(xs, ys)]
    ss = sum(e * e for e in res)
    se = math.sqrt(ss / (n - 2) / sxx)
    if ss > 0:
        r = sum(a * b for a, b in zip(res, res[1:])) / ss
        r = min(max(r, 0.0), W.TREND_MAX_AUTOCORR)
        se *= math.sqrt((1 + r) / (1 - r))
    return slope, intercept, se


def trend_for(history: list[Reading], vital: str, now: datetime) -> Trend | None:
    start = now - timedelta(hours=W.TREND_WINDOW_HOURS)
    points = [(r.ts, v) for r in history if r.ts >= start and (v := r.get(vital)) is not None]
    if len(points) < 3:
        return None
    xs = [(ts - now).total_seconds() / 3600 for ts, _ in points]
    ys = [v for _, v in points]
    slope, _, se = linear_fit(xs, ys)
    if se == 0:
        t = math.inf if slope else 0.0
    else:
        t = slope / se
    direction, threshold = W.TREND_THRESHOLD[vital]
    steep = (
        (direction == "up" and slope >= threshold)
        or (direction == "down" and slope <= -threshold)
        or (direction == "both" and abs(slope) >= threshold)
    )
    flagged = len(points) >= W.TREND_MIN_POINTS and steep and abs(t) >= W.TREND_MIN_T
    return Trend(vital=vital, slope_per_hr=slope, t_stat=t, n=len(points), window_hr=W.TREND_WINDOW_HOURS, flagged=flagged)
