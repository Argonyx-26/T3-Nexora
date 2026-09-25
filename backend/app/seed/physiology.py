"""A small, believable vitals generator. Each vital is the patient's normal, plus a
day/night rhythm, plus a slow physiological wander (AR(1)), plus reading-to-reading
measurement jitter — the split real monitors show. Shared by the seeder and the live
simulator so the live stream continues seamlessly from the seeded history.
"""

from __future__ import annotations

import math
import random
from datetime import datetime, timedelta

IST = timedelta(hours=5, minutes=30)
PHI = 0.97  # the slow wander remembers ~2.5 h
SLOW_SHARE = 0.35  # share of the patient's spread that is slow wander; the rest is jitter
JITTER_CAP = 2.5

# Day/night swing (amplitude, IST hour of the peak).
CIRCADIAN = {"hr": (4.0, 15), "sbp": (5.0, 14), "dbp": (3.0, 14), "temp": (0.25, 18), "rr": (0.5, 15)}

ROUND = {"hr": 0, "spo2": 0, "sbp": 0, "dbp": 0, "rr": 0, "temp": 1, "glucose": 0}
LIMITS = {"hr": (25, 220), "spo2": (50, 100), "sbp": (50, 260), "dbp": (30, 160), "rr": (4, 50), "temp": (33, 42.5), "glucose": (30, 600)}


def circadian(vital: str, ts_utc: datetime) -> float:
    if vital not in CIRCADIAN:
        return 0.0
    amp, peak = CIRCADIAN[vital]
    hour = ((ts_utc + IST).hour + (ts_utc + IST).minute / 60) % 24
    return amp * math.cos(2 * math.pi * (hour - peak) / 24)


def clamp_round(vital: str, value: float) -> float:
    lo, hi = LIMITS[vital]
    return round(min(max(value, lo), hi), ROUND[vital])


class VitalGenerator:
    """generator.next(ts, offsets) → one reading's values. offsets shift the target (scenarios)."""

    def __init__(self, normals: dict[str, tuple[float, float]], rng: random.Random):
        self.normals = normals
        self.rng = rng
        self.state = {v: 0.0 for v in normals}  # slow-wander deviation from the normal

    def next(self, ts: datetime, offsets: dict[str, float] | None = None, extra_noise: dict[str, float] | None = None) -> dict[str, float]:
        offsets = offsets or {}
        extra_noise = extra_noise or {}
        out = {}
        for vital, (mean, std) in self.normals.items():
            slow_sd = std * SLOW_SHARE
            jitter_sd = std * math.sqrt(1 - SLOW_SHARE**2)
            self.state[vital] = PHI * self.state[vital] + self.rng.gauss(0, slow_sd * math.sqrt(1 - PHI * PHI))
            # Jitter is capped at ±JITTER_CAP σ: bedside readings don't throw 4σ one-off spikes.
            jitter = max(-JITTER_CAP, min(JITTER_CAP, self.rng.gauss(0, 1))) * jitter_sd
            value = mean + circadian(vital, ts) + self.state[vital] + jitter + offsets.get(vital, 0.0)
            if vital in extra_noise:
                value += self.rng.gauss(0, extra_noise[vital])
            out[vital] = clamp_round(vital, value)
        return out
