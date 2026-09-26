"""What the doctor's dashboard reads on top of the risk score: how much to trust it,
what changed suddenly, and patterns worth a look.

- Data quality: how complete and fresh the readings are, and whether the baselines were
  learned from the patient's own history.
- Confidence: a transparent heuristic (not a calibrated probability) from data quality,
  how many independent kinds of signal agree, and how far the score sits from a level
  boundary. The UI labels it as such.
- Sudden changes: a vital that moved sharply within the last hour (BP, SpO₂, HR,
  temperature, breathing rate), or a reading outside a safe range.
- Missed-dose patterns: the same medicine missed at the same time of day, doses missed
  on the same weekdays, runs of consecutive misses, and critical medicines missed lately.
- Mood (self-reported check-ins, not a screening tool): a drop in mood or poor sleep.

Nothing here changes the risk score; it helps a doctor decide what to look at first.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from statistics import mean

from ..risk import RiskResult
from ..seed.physiology import IST

KEY_VITALS = ("hr", "spo2", "sbp", "rr", "temp")
EXPECTED_PER_HOUR = 12  # one reading every 5 minutes
BOUNDARIES = (25, 50, 75)

# vital → (label, change within an hour that counts as sudden, direction: "both" | "down" | "up", unit)
SUDDEN = {
    "sbp": ("Blood pressure", 20.0, "both", "mmHg"),
    "spo2": ("SpO₂", 3.0, "down", "%"),
    "hr": ("Heart rate", 20.0, "both", "bpm"),
    "temp": ("Temperature", 0.8, "both", "°C"),
    "rr": ("Breathing rate", 6.0, "both", "/min"),
}
# vital → (low, high): outside this is flagged whatever the trend
SAFE = {"hr": (45, 125), "spo2": (92, 101), "sbp": (95, 180), "temp": (35.5, 38.4), "rr": (9, 24)}
WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


@dataclass
class Quality:
    label: str  # "Good" | "Fair" | "Poor"
    completeness: float  # readings in the last hour / expected
    last_reading_min: float
    baseline_coverage: float  # share of key vitals with a baseline learned from history
    notes: list[str]


def data_quality(history: list, now: datetime, risk: RiskResult) -> Quality:
    recent = [r for r in history if r.ts > now - timedelta(hours=1)]
    completeness = min(1.0, len(recent) / EXPECTED_PER_HOUR)
    last_min = (now - history[-1].ts).total_seconds() / 60 if history else 999.0
    learned = [v for v in KEY_VITALS if (b := risk.baselines.get(v)) and b.source == "history" and b.n >= 24]
    coverage = len(learned) / len(KEY_VITALS)
    notes = []
    if completeness < 0.8:
        notes.append(f"{len(recent)} of {EXPECTED_PER_HOUR} expected readings in the last hour")
    if last_min > 15:
        notes.append(f"last reading {round(last_min)} min ago")
    if coverage < 1:
        missing = [v for v in KEY_VITALS if v not in learned]
        notes.append("baseline not yet learned for " + ", ".join(missing))
    if completeness >= 0.8 and last_min <= 15 and coverage >= 0.8:
        label = "Good"
    elif completeness < 0.4 or last_min > 60:
        label = "Poor"
    else:
        label = "Fair"
    return Quality(label, round(completeness, 2), round(last_min, 1), round(coverage, 2), notes)


def confidence(risk: RiskResult, q: Quality) -> tuple[int, list[str]]:
    """0–100, higher = more sure the level is right. A heuristic, shown with its reasons."""
    reasons = []
    pts = 40.0
    dq = {"Good": 25, "Fair": 12, "Poor": 0}[q.label]
    pts += dq
    reasons.append(f"{q.label.lower()} data quality (+{dq})")
    kinds = {f.kind for f in risk.factors if f.contribution > 0 and f.kind != "escalation"}
    if risk.level != "Stable":
        agree = min(15, 5 * len(kinds))
        pts += agree
        reasons.append(f"{len(kinds)} independent signal{'s' if len(kinds) != 1 else ''} agree (+{agree})")
    margin = min(abs(risk.score - b) for b in BOUNDARIES)
    m = min(10.0, margin / 12.5 * 10)
    pts += m
    reasons.append(f"score {margin} points from a level boundary (+{round(m)})")
    if any(f.kind == "escalation" for f in risk.factors):
        pts += 10
        reasons.append("set by a hospital rule (NEWS2 / qSOFA / red-flag symptom) (+10)")
    return int(max(35, min(95, round(pts)))), reasons


def sudden_changes(history: list, now: datetime, spo2_scale: int = 1) -> list[dict]:
    """Vitals that moved sharply in the last hour, or sit outside a safe range right now."""
    latest = [r for r in history if r.ts > now - timedelta(minutes=15)]
    earlier = [r for r in history if now - timedelta(minutes=75) <= r.ts <= now - timedelta(minutes=45)]
    out = []
    if not latest:
        return out
    for v, (label, thr, direction, unit) in SUDDEN.items():
        cur_vals = [r.get(v) for r in latest if r.get(v) is not None]
        if not cur_vals:
            continue
        cur = mean(cur_vals)
        before = mean([r.get(v) for r in earlier if r.get(v) is not None]) if earlier else None
        delta = None if before is None else cur - before
        sudden = delta is not None and (
            (direction == "down" and delta <= -thr) or (direction == "up" and delta >= thr) or (direction == "both" and abs(delta) >= thr)
        )
        lo, hi = SAFE[v]
        if v == "spo2" and spo2_scale == 2:
            lo = 88  # prescribed 88–92% target
        abnormal = cur < lo or cur > hi
        if sudden or abnormal:
            big = delta is not None and abs(delta) >= 1.5 * thr
            out.append({
                "vital": v, "label": label, "unit": unit,
                "from": None if before is None else round(before, 1), "to": round(cur, 1),
                "delta": None if delta is None else round(delta, 1),
                "sudden": bool(sudden), "abnormal": abnormal,
                "severity": "High" if (big or (abnormal and sudden)) else "Moderate",
            })
    return sorted(out, key=lambda c: (c["severity"] != "High", c["vital"]))


def missed_patterns(doses: list[tuple[str, bool, datetime, str]], now: datetime) -> list[dict]:
    """doses: (medicine, critical, scheduled_at UTC, status) for past doses. Returns patterns worth a look."""
    past = sorted((d for d in doses if d[2] <= now and d[3] in ("taken", "missed")), key=lambda d: d[2])
    missed = [d for d in past if d[3] == "missed"]
    out: list[dict] = []
    if not missed:
        return out

    # same medicine, same time of day
    slots: dict[tuple[str, str], list[str]] = defaultdict(list)
    for med, _, at, status in past:
        slots[(med, (at + IST).strftime("%H:%M"))].append(status)
    for (med, hhmm), statuses in slots.items():
        m = statuses.count("missed")
        if m >= 2 and m / len(statuses) >= 0.3:
            out.append({"kind": "time", "medicine": med, "slot": hhmm, "missed": m, "total": len(statuses),
                        "text": f"{med} at {hhmm} missed {m} of {len(statuses)} times"})

    # the same weekdays — only if the misses fall on at least two different dates (one bad morning is not a pattern)
    by_day = Counter(WEEKDAYS[(d[2] + IST).weekday()] for d in missed)
    heavy = [day for day, n in by_day.items() if n >= 2]
    on_heavy = [d for d in missed if WEEKDAYS[(d[2] + IST).weekday()] in heavy]
    dates = {(d[2] + IST).date() for d in on_heavy}
    if heavy and len(dates) >= 2 and len(on_heavy) / len(missed) >= 0.6 and len(heavy) <= 3:
        days = sorted(heavy, key=WEEKDAYS.index)
        at = Counter((d[2] + IST).strftime("%H:%M") for d in on_heavy).most_common(1)[0][0]
        out.append({"kind": "weekday", "days": days, "missed": len(on_heavy), "critical": any(d[1] for d in on_heavy),
                    "text": f"Doses missed mostly on {' & '.join(days)} (usually the {at} dose)"})

    # runs of consecutive misses, per medicine
    per_med: dict[str, list[str]] = defaultdict(list)
    for med, _, _, status in past:
        per_med[med].append(status)
    for med, statuses in per_med.items():
        run = best = 0
        for st in statuses:
            run = run + 1 if st == "missed" else 0
            best = max(best, run)
        if best >= 2:
            out.append({"kind": "streak", "medicine": med, "missed": best, "text": f"{med}: {best} doses missed in a row"})

    # critical medicines missed in the last 48 h
    crit = sorted({med for med, critical, at, status in missed if critical and at >= now - timedelta(hours=48)})
    for med in crit:
        out.append({"kind": "critical", "medicine": med, "text": f"Critical medicine missed in the last 48 h: {med}"})
    return out


def _iso(ts: datetime) -> str:
    return ts.replace(microsecond=0).isoformat() + "Z"  # stored naive UTC; say so on the wire


def mood_changes(checkins: list[tuple[datetime, int, int, int]]) -> tuple[dict, list[dict]]:
    """checkins: (ts, mood, energy, sleep), any order. Self-reported; flags a clear drop only."""
    rows = sorted(checkins)
    summary = {
        "count": len(rows),
        "mood_avg": round(mean(r[1] for r in rows), 1) if rows else None,
        "sleep_avg": round(mean(r[3] for r in rows), 1) if rows else None,
        "energy_avg": round(mean(r[2] for r in rows), 1) if rows else None,
        "last": None if not rows else {"ts": _iso(rows[-1][0]), "mood": rows[-1][1], "energy": rows[-1][2], "sleep": rows[-1][3]},
        "series": [{"ts": _iso(r[0]), "mood": r[1], "energy": r[2], "sleep": r[3]} for r in rows[-14:]],
    }
    changes = []
    if len(rows) >= 4:
        recent, before = [r[1] for r in rows[-2:]], [r[1] for r in rows[:-2]]
        drop = mean(before) - mean(recent)
        if drop >= 1.0:
            changes.append({"kind": "mood", "severity": "Moderate",
                            "text": f"Mood lower over the last 2 check-ins ({mean(recent):.1f} vs {mean(before):.1f} out of 5)"})
    if len(rows) >= 3 and sum(1 for r in rows[-3:] if r[3] == 1) >= 2:
        changes.append({"kind": "sleep", "severity": "Moderate", "text": "Poor sleep reported on most recent nights"})
    return summary, changes
