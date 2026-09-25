"""NEWS2 — the Royal College of Physicians National Early Warning Score 2.

Implements the official chart exactly. Values are rounded the way they are charted
(whole numbers; temperature to one decimal) before being scored.
"""

from __future__ import annotations

import math

from .types import News2Result, Reading


def _whole(v: float) -> int:
    return int(math.floor(v + 0.5))


def _one_decimal(v: float) -> float:
    return math.floor(v * 10 + 0.5) / 10


def score_rr(rr: float) -> int:
    r = _whole(rr)
    if r <= 8:
        return 3
    if r <= 11:
        return 1
    if r <= 20:
        return 0
    if r <= 24:
        return 2
    return 3


def score_spo2_scale1(spo2: float) -> int:
    s = _whole(spo2)
    if s <= 91:
        return 3
    if s <= 93:
        return 2
    if s <= 95:
        return 1
    return 0


def score_spo2_scale2(spo2: float, on_oxygen: bool) -> int:
    """Scale 2: for patients with a prescribed 88–92% target (hypercapnic respiratory failure)."""
    s = _whole(spo2)
    if s <= 83:
        return 3
    if s <= 85:
        return 2
    if s <= 87:
        return 1
    if s <= 92 or not on_oxygen:
        return 0
    if s <= 94:
        return 1
    if s <= 96:
        return 2
    return 3


def score_oxygen(on_oxygen: bool) -> int:
    return 2 if on_oxygen else 0


def score_temp(temp: float) -> int:
    t = _one_decimal(temp)
    if t <= 35.0:
        return 3
    if t <= 36.0:
        return 1
    if t <= 38.0:
        return 0
    if t <= 39.0:
        return 1
    return 2


def score_sbp(sbp: float) -> int:
    s = _whole(sbp)
    if s <= 90:
        return 3
    if s <= 100:
        return 2
    if s <= 110:
        return 1
    if s <= 219:
        return 0
    return 3


def score_hr(hr: float) -> int:
    h = _whole(hr)
    if h <= 40:
        return 3
    if h <= 50:
        return 1
    if h <= 90:
        return 0
    if h <= 110:
        return 1
    if h <= 130:
        return 2
    return 3


def score_consciousness(level: str) -> int:
    return 0 if level.upper() == "A" else 3


RESPONSE = {
    "Low": "Routine: registered nurse to assess; observations 4–12 hourly.",
    "Low-Medium": "Urgent ward-based review: a single parameter scores 3.",
    "Medium": "Urgent review by a clinician competent in acute illness; at least hourly observations.",
    "High": "Emergency assessment by the critical-care team; continuous monitoring.",
}


def band_for(total: int, any_three: bool) -> str:
    if total >= 7:
        return "High"
    if total >= 5:
        return "Medium"
    if any_three:
        return "Low-Medium"
    return "Low"


def news2(reading: Reading, spo2_scale: int = 1) -> News2Result:
    if spo2_scale == 2:
        spo2 = score_spo2_scale2(reading.spo2, reading.on_oxygen)
    else:
        spo2 = score_spo2_scale1(reading.spo2)
    parameters = {
        "rr": score_rr(reading.rr),
        "spo2": spo2,
        "oxygen": score_oxygen(reading.on_oxygen),
        "temp": score_temp(reading.temp),
        "sbp": score_sbp(reading.sbp),
        "hr": score_hr(reading.hr),
        "consciousness": score_consciousness(reading.consciousness),
    }
    total = sum(parameters.values())
    any_three = any(v == 3 for v in parameters.values())
    band = band_for(total, any_three)
    return News2Result(total=total, band=band, parameters=parameters, any_three=any_three, response=RESPONSE[band])
