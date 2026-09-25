"""Small builders for synthetic readings and histories used across the tests."""

from __future__ import annotations

import random
from datetime import datetime, timedelta
from typing import Callable

from app.risk.types import Reading

T0 = datetime(2026, 9, 25, 12, 0)

NORMAL = {"hr": 72.0, "spo2": 97.0, "sbp": 120.0, "dbp": 78.0, "rr": 16.0, "temp": 36.8, "glucose": 100.0}
NOISE = {"hr": 2.0, "spo2": 0.4, "sbp": 3.0, "dbp": 2.0, "rr": 0.6, "temp": 0.08, "glucose": 4.0}


def reading(ts: datetime = T0, **overrides) -> Reading:
    values = {**NORMAL, **overrides}
    return Reading(ts=ts, **values)


def history(
    hours: float,
    step_min: int = 5,
    end: datetime = T0,
    base: dict | None = None,
    change: Callable[[float, dict], dict] | None = None,
    seed: int = 7,
    noise: bool = True,
) -> list[Reading]:
    """Readings every step_min minutes ending at `end`.

    change(hours_before_end, values) may return modified values — use it to inject a drift.
    """
    rng = random.Random(seed)
    base = {**NORMAL, **(base or {})}
    n = int(hours * 60 / step_min) + 1
    out = []
    for i in range(n):
        ts = end - timedelta(minutes=step_min * (n - 1 - i))
        values = dict(base)
        if noise:
            for k, sd in NOISE.items():
                values[k] = values[k] + rng.gauss(0, sd)
        if change:
            values = change((end - ts).total_seconds() / 3600, values)
        values["spo2"] = min(values["spo2"], 100.0)
        out.append(Reading(ts=ts, **values))
    return out
