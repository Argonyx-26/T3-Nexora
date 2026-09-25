"""Injectable deterioration scenarios for the live simulator.

Each scenario shifts a patient's vitals away from their own normal at a steady rate per
simulated hour (capped), adds extra noise where the physiology is irregular, and fires
timed events: a reported symptom, new confusion, or missed doses. The same definitions
drive the live demo and the offline evaluation, so what the judges see live is what the
evaluation measured.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Event:
    at_h: float
    kind: str  # "symptom" | "consciousness" | "missed_doses"
    value: str = ""


@dataclass(frozen=True)
class Scenario:
    key: str
    label: str
    description: str
    best_for: tuple[str, ...]
    duration_h: float
    rates: dict[str, tuple[float, float]]  # vital → (change per hour, cap on total change)
    extra_noise: dict[str, float] = field(default_factory=dict)
    events: tuple[Event, ...] = ()

    def offsets(self, hours: float) -> dict[str, float]:
        out = {}
        for vital, (rate, cap) in self.rates.items():
            change = rate * hours
            out[vital] = math.copysign(min(abs(change), abs(cap)), rate)
        return out


SCENARIOS: dict[str, Scenario] = {
    s.key: s
    for s in [
        Scenario(
            key="sepsis",
            label="Sepsis",
            description="Heart rate, temperature and breathing climb while blood pressure slowly falls; new confusion late.",
            best_for=("P003", "P008", "P009"),
            duration_h=6,
            rates={"hr": (8.0, 45), "temp": (0.45, 2.4), "rr": (1.6, 11), "sbp": (-6.0, -42), "dbp": (-4.0, -26)},
            events=(Event(1.5, "symptom", "fever_chills"), Event(4.5, "consciousness", "C")),
        ),
        Scenario(
            key="hypoxia",
            label="Hypoxia",
            description="SpO₂ drifts down about 1% an hour with breathing and heart rate creeping up.",
            best_for=("P006", "P002"),
            duration_h=6,
            rates={"spo2": (-1.0, -12), "rr": (1.2, 10), "hr": (3.5, 25)},
            events=(Event(2.5, "symptom", "breathlessness"),),
        ),
        Scenario(
            key="hypertensive_crisis",
            label="Hypertensive crisis",
            description="Blood pressure surges well above this patient's own high normal, with headache and blurred vision.",
            best_for=("P001", "P007"),
            duration_h=5,
            rates={"sbp": (18.0, 75), "dbp": (10.0, 42), "hr": (4.0, 18)},
            events=(Event(1.5, "symptom", "severe_headache"), Event(2.5, "symptom", "blurred_vision")),
        ),
        Scenario(
            key="cardiac",
            label="Cardiac event",
            description="Irregular, rising heart rate with palpitations, then chest pain — a red-flag symptom.",
            best_for=("P010", "P004"),
            duration_h=4,
            rates={"hr": (10.0, 45), "spo2": (-0.6, -5), "rr": (1.0, 7), "sbp": (-4.0, -22)},
            extra_noise={"hr": 7.0},
            events=(Event(0.5, "symptom", "palpitations"), Event(1.5, "symptom", "chest_pain")),
        ),
        Scenario(
            key="missed_meds",
            label="Missed medication",
            description="Critical doses are missed; for a diabetic, glucose climbs with thirst, then vomiting and faster breathing.",
            best_for=("P005", "P001"),
            duration_h=6,
            rates={"glucose": (40.0, 250), "hr": (3.0, 18), "rr": (0.9, 6)},
            events=(Event(0.0, "missed_doses"), Event(2.0, "symptom", "excessive_thirst"),
                    Event(2.5, "symptom", "frequent_urination"), Event(4.0, "symptom", "vomiting")),
        ),
    ]
}

RECOVER_KEY = "recover"
RECOVER_HALF_LIFE_H = 0.5  # offsets halve every 30 simulated minutes

CATALOG = [
    {"key": s.key, "label": s.label, "description": s.description, "best_for": list(s.best_for), "duration_h": s.duration_h}
    for s in SCENARIOS.values()
] + [{
    "key": RECOVER_KEY,
    "label": "Recover",
    "description": "Vitals ease back to this patient's own normal; reported symptoms are marked resolved.",
    "best_for": [],
    "duration_h": 3,
}]


def recover_offsets(start: dict[str, float], hours: float) -> dict[str, float]:
    k = 0.5 ** (hours / RECOVER_HALF_LIFE_H)
    return {v: o * k for v, o in start.items()}
