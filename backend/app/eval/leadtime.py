"""Offline evaluation: how much earlier does AYU raise the alarm than threshold-only NEWS2?

For each scenario, on each patient it suits, over several random seeds:
  1. generate 7 days of that patient's normal readings (same generator as the live ward),
  2. inject the scenario (same definitions as the live demo) and step 5 minutes at a time,
  3. score every tick with the AYU engine, and note when each method first escalates, on two
     tiers so like is compared with like:
       - "urgent": review within the hour — NEWS2 total >= 5 (Medium) vs AYU Warning (score >= 50);
       - "first":  each system's own first alert — NEWS2 total >= 5 or any single parameter
                   scoring 3, vs AYU Watch (score >= 25) confirmed on the next reading.
Lead time = NEWS2's first escalation minus AYU's. A scenario NEWS2 never escalates on within
the horizon is reported as "never", not as a number.

The same patients are also run at rest (no scenario) to count escalations that happen for
no reason, so AYU is measured on false alarms as well as on speed.

Synthetic data, not clinical validation. Symptoms reported during a scenario are visible to
AYU only, because NEWS2 does not use symptoms by design.
"""

from __future__ import annotations

import random
import statistics
from dataclasses import dataclass
from datetime import datetime, time, timedelta

from ..risk import Dose, PatientContext, Reading, SymptomEntry, assess
from ..risk.baseline import all_baselines
from ..seed.patients import PATIENTS
from ..seed.physiology import IST, VitalGenerator
from ..sim.scenarios import SCENARIOS

STEP = timedelta(minutes=5)
TICKS_PER_HOUR = 12
T0 = datetime(2026, 9, 20, 6, 30)  # fixed start (noon IST) keeps every run reproducible
HISTORY_DAYS = 7
CONTEXT_TICKS = 60  # the engine only needs the last few hours once baselines are cached
TIERS = {
    "urgent": {"label": "Urgent review (within the hour)", "news2": "NEWS2 total ≥ 5 (Medium)", "ayu": "AYU Warning or above (score ≥ 50)"},
    "first": {"label": "First alert (each system's own rule)", "news2": "NEWS2 total ≥ 5, or any single parameter scoring 3",
              "ayu": "AYU Watch or above (score ≥ 25), confirmed on the next reading"},
}
BY_ID = {p["id"]: p for p in PATIENTS}


@dataclass
class Tick:
    h: float
    score: int
    level: str
    news2: int
    news2_trigger: bool  # total >= 5 or a single parameter at 3


def _schedule(p: dict, start: datetime, end: datetime) -> list[tuple[str, datetime, bool]]:
    out = []
    day = (start + IST).date()
    while day <= (end + IST).date():
        for med in p["meds"]:
            for hhmm in med["times"]:
                h, m = (int(x) for x in hhmm.split(":"))
                at = datetime.combine(day, time(h, m)) - IST
                if start <= at <= end:
                    out.append((med["name"], at, med["critical"]))
        day += timedelta(days=1)
    return out


def run_once(patient_id: str, scenario: str | None, seed: int, horizon_h: float) -> list[Tick]:
    p = BY_ID[patient_id]
    normals = {k: (float(m), float(s)) for k, (m, s) in p["normals"].items()}
    gen = VitalGenerator(normals, random.Random(f"eval-{seed}-{patient_id}"))
    start = T0 - timedelta(days=HISTORY_DAYS)
    history = [Reading(ts=(ts := start + i * STEP), **gen.next(ts)) for i in range(HISTORY_DAYS * 288)]
    t0 = history[-1].ts
    spec = SCENARIOS.get(scenario) if scenario else None
    schedule = _schedule(p, t0 - timedelta(days=HISTORY_DAYS), t0 + timedelta(hours=horizon_h))
    symptoms: list[SymptomEntry] = []
    consciousness = "A"
    missed_from: datetime | None = None
    fired: set[int] = set()
    baselines = all_baselines(history, t0, normals)
    ticks = []
    for i in range(1, int(horizon_h * TICKS_PER_HOUR) + 1):
        t = t0 + i * STEP
        h = i / TICKS_PER_HOUR
        if spec:
            for j, ev in enumerate(spec.events):
                if j in fired or h < ev.at_h:
                    continue
                fired.add(j)
                if ev.kind == "symptom":
                    symptoms.append(SymptomEntry(t, ev.value))
                elif ev.kind == "consciousness":
                    consciousness = ev.value
                elif ev.kind == "missed_doses":
                    missed_from = t - timedelta(hours=12)
        values = gen.next(t, spec.offsets(h) if spec else {}, spec.extra_noise if spec else None)
        history.append(Reading(ts=t, consciousness=consciousness, **values))
        if i % TICKS_PER_HOUR == 0:
            baselines = all_baselines(history, t, normals)
        doses = [
            Dose(name, at, "missed" if (missed_from and critical and at >= missed_from) else "taken", critical)
            for name, at, critical in schedule if at <= t
        ]
        r = assess(PatientContext(patient_id, history[-CONTEXT_TICKS:], declared_normals=normals, doses=doses,
                                  symptoms=symptoms, spo2_scale=p.get("spo2_scale", 1), baselines=baselines))
        ticks.append(Tick(h=h, score=r.score, level=r.level, news2=r.news2.total,
                          news2_trigger=r.news2.total >= 5 or r.news2.any_three))
    return ticks


def first(ticks: list[Tick], pred) -> float | None:
    return next((t.h for t in ticks if pred(t)), None)


def first_confirmed(ticks: list[Tick], pred) -> float | None:
    """First time `pred` holds on two readings in a row (the time of the confirming reading)."""
    return next((b.h for a, b in zip(ticks, ticks[1:]) if pred(a) and pred(b)), None)


TIER_FNS = {
    "urgent": (lambda ts: first(ts, lambda t: t.score >= 50), lambda ts: first(ts, lambda t: t.news2 >= 5)),
    "first": (lambda ts: first_confirmed(ts, lambda t: t.score >= 25), lambda ts: first(ts, lambda t: t.news2_trigger)),
}
REST_FNS = {
    "urgent": (lambda t: t.score >= 50, lambda t: t.news2 >= 5),
    "first": (lambda t: t.score >= 25, lambda t: t.news2_trigger),
}


def episodes(flags: list[bool]) -> int:
    """How many times a condition switches on (a new alarm), not how many ticks it stays on."""
    return sum(1 for i, f in enumerate(flags) if f and (i == 0 or not flags[i - 1]))


def _median(xs):
    return round(statistics.median(xs), 2) if xs else None


def _lead(ayu, news2):
    return round(news2 - ayu, 2) if (ayu is not None and news2 is not None) else None


def _tier_summary(rs: list[dict], tier: str) -> dict:
    ayu = [r[tier]["ayu_h"] for r in rs]
    news2 = [r[tier]["news2_h"] for r in rs]
    leads = [r[tier]["lead_h"] for r in rs if r[tier]["lead_h"] is not None]
    ayu_first = sum(1 for a, n in zip(ayu, news2) if a is not None and (n is None or a < n))
    ties = sum(1 for a, n in zip(ayu, news2) if a is not None and a == n)
    return {
        "ayu_h_median": _median([a for a in ayu if a is not None]),
        "news2_h_median": _median([n for n in news2 if n is not None]),
        "lead_h_median": _median(leads),
        "lead_h_min": min(leads) if leads else None,
        "lead_h_max": max(leads) if leads else None,
        "ayu_first": ayu_first, "ties": ties, "news2_first": len(rs) - ayu_first - ties,
        "ayu_never": sum(a is None for a in ayu), "news2_never": sum(n is None for n in news2),
    }


def evaluate(seeds: int = 5, horizon_h: float = 8.0, rest_hours: float = 24.0) -> dict:
    runs = []
    for key, spec in SCENARIOS.items():
        for pid in spec.best_for:
            for seed in range(seeds):
                ticks = run_once(pid, key, seed, horizon_h)
                run = {"scenario": key, "patient_id": pid, "patient_name": BY_ID[pid]["name"], "seed": seed}
                for tier, (ayu_fn, news2_fn) in TIER_FNS.items():
                    a, n = ayu_fn(ticks), news2_fn(ticks)
                    run[tier] = {"ayu_h": a, "news2_h": n, "lead_h": _lead(a, n)}
                runs.append(run)

    scenarios = []
    for key, spec in SCENARIOS.items():
        rs = [r for r in runs if r["scenario"] == key]
        scenarios.append({"key": key, "label": spec.label, "patients": list(spec.best_for), "runs": len(rs),
                          **{tier: _tier_summary(rs, tier) for tier in TIERS}})

    rest = []
    for p in PATIENTS:
        counts = {tier: {"ayu": 0, "news2": 0} for tier in TIERS}
        for seed in range(seeds):
            ticks = run_once(p["id"], None, 1000 + seed, rest_hours)
            for tier, (ayu_pred, news2_pred) in REST_FNS.items():
                counts[tier]["ayu"] += episodes([ayu_pred(t) for t in ticks]) if tier == "urgent" else \
                    episodes([ayu_pred(a) and ayu_pred(b) for a, b in zip(ticks, ticks[1:])])
                counts[tier]["news2"] += episodes([news2_pred(t) for t in ticks])
        rest.append({"patient_id": p["id"], "patient_name": p["name"], "patient_days": round(seeds * rest_hours / 24, 1), **counts})

    example = run_once("P003", "sepsis", 0, horizon_h)
    return {
        "config": {"seeds": seeds, "horizon_h": horizon_h, "minutes_per_tick": int(STEP.total_seconds() // 60),
                   "rest_hours_per_seed": rest_hours, "tiers": TIERS},
        "summary": {
            "runs": len(runs),
            "rest_patient_days": round(sum(x["patient_days"] for x in rest), 1),
            **{tier: {**_tier_summary(runs, tier),
                      "rest_ayu_alarms": sum(x[tier]["ayu"] for x in rest),
                      "rest_news2_alarms": sum(x[tier]["news2"] for x in rest)} for tier in TIERS},
        },
        "scenarios": scenarios,
        "runs": runs,
        "rest": rest,
        "example": {"scenario": "sepsis", "patient_id": "P003", "patient_name": BY_ID["P003"]["name"],
                    "points": [{"h": round(t.h, 3), "ayu": t.score, "news2": t.news2} for t in example]},
    }
