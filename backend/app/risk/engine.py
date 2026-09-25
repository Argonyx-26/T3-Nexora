"""The AYU risk engine: combines NEWS2, qSOFA, personal baseline, trend, medication
adherence and symptoms into one 0–100 score with a level, where every point of the
score is traced to a named contributing factor.

    score = NEWS2 + qSOFA + baseline deviations + trends + medication + symptoms
            (each group capped; see weights.py), then raised to any escalation floor.

The factor contributions always add up to the score.
"""

from __future__ import annotations

import math

from . import weights as W
from .adherence import adherence
from .baseline import all_baselines, current_value, deviation
from .news2 import news2
from .qsofa import qsofa
from .symptoms import active_symptoms, red_flags
from .trend import trend_for
from .types import Factor, PatientContext, RiskResult

# The vitals that NEWS2 itself scores, so a message can say "NEWS2 still calls this normal".
NEWS2_PARAM = {"hr": "hr", "spo2": "spo2", "sbp": "sbp", "rr": "rr", "temp": "temp"}


def level_for(score: float) -> str:
    level = W.LEVELS[0][0]
    for name, minimum in W.LEVELS:
        if score >= minimum:
            level = name
    return level


def fmt(vital: str, value: float) -> str:
    d = W.VITAL_META[vital]["decimals"]
    return f"{value:.{d}f}"


def with_unit(vital: str, text: str) -> str:
    unit = W.VITAL_META[vital]["unit"]
    return f"{text}{unit}" if unit == "%" else f"{text} {unit}"


NEWS2_LABEL = {"rr": "RR", "spo2": "SpO₂", "oxygen": "O₂", "temp": "Temp", "sbp": "SBP", "hr": "HR", "consciousness": "AVPU"}


def _cap(factors: list[Factor], cap: float) -> list[Factor]:
    """Scale a group down proportionally so it never exceeds its cap."""
    total = sum(f.contribution for f in factors)
    if total > cap:
        for f in factors:
            f.contribution *= cap / total
    return factors


def _news2_note(vital: str, news2_params: dict[str, int]) -> str:
    param = NEWS2_PARAM.get(vital)
    if param is None:
        return " NEWS2 does not track this."
    if news2_params.get(param, 0) == 0:
        return " NEWS2 still scores this as normal."
    return ""


def assess(ctx: PatientContext) -> RiskResult:
    if not ctx.history:
        raise ValueError("assess() needs at least one reading")
    now = ctx.now
    latest = ctx.history[-1]
    symptoms_now = active_symptoms(ctx.symptoms, now)
    flags = red_flags(symptoms_now)

    n2 = news2(latest, ctx.spo2_scale)
    q = qsofa(latest, altered_mentation="confusion" in symptoms_now)
    baselines = ctx.baselines if ctx.baselines is not None else all_baselines(ctx.history, now, ctx.declared_normals)
    deviations = {}
    for vital, b in baselines.items():
        v = current_value(ctx.history, vital)
        if v is not None:
            deviations[vital] = deviation(vital, v, b)
    trends = {}
    for vital in W.VITALS:
        t = trend_for(ctx.history, vital, now)
        if t is not None:
            trends[vital] = t
    adh = adherence(ctx.doses, now)

    factors: list[Factor] = []

    # 1. NEWS2
    if n2.total > 0:
        parts = ", ".join(f"{NEWS2_LABEL[k]} +{s}" for k, s in n2.parameters.items() if s)
        factors.append(Factor(
            factor="news2", kind="news2",
            headline=f"NEWS2 {n2.total} ({n2.band})",
            message=f"NEWS2 is {n2.total} ({n2.band}) from {parts}.",
            value=n2.total, baseline=None, weight=W.NEWS2_POINTS_PER_UNIT,
            contribution=min(n2.total * W.NEWS2_POINTS_PER_UNIT, W.NEWS2_CAP),
        ))
    if n2.any_three:
        which = [k for k, s in n2.parameters.items() if s == 3]
        factors.append(Factor(
            factor="news2_single_three", kind="news2",
            headline="A single NEWS2 parameter at 3",
            message=f"{', '.join(NEWS2_LABEL[k] for k in which)} scores 3 on its own, which NEWS2 treats as needing urgent review.",
            value=3, baseline=None, weight=W.NEWS2_SINGLE_THREE_POINTS, contribution=W.NEWS2_SINGLE_THREE_POINTS,
        ))

    # 2. qSOFA
    if q.flag:
        met = [k for k, ok in q.criteria.items() if ok]
        names = {"rr_ge_22": "RR ≥ 22", "sbp_le_100": "SBP ≤ 100", "altered_mentation": "altered mentation"}
        factors.append(Factor(
            factor="qsofa", kind="qsofa",
            headline=f"qSOFA {q.score}/3 — sepsis risk",
            message=f"qSOFA is {q.score}/3 ({', '.join(names[m] for m in met)}): screen for sepsis.",
            value=q.score, baseline=None, weight=W.QSOFA_POINTS, contribution=W.QSOFA_POINTS,
        ))

    # 3. Personal baseline
    dev_factors = []
    for vital, d in deviations.items():
        if not d.flagged:
            continue
        meta = W.VITAL_META[vital]
        weight = W.DEVIATION_WEIGHT[vital]
        side = "above" if d.z > 0 else "below"
        dev_factors.append(Factor(
            factor=f"{vital}_baseline", kind="baseline",
            headline=f"{meta['short']} {side} personal baseline",
            message=(
                f"{meta['label']} {with_unit(vital, fmt(vital, d.value))} is {with_unit(vital, fmt(vital, abs(d.value - d.baseline.mean)))} "
                f"{side} this patient's baseline of {with_unit(vital, fmt(vital, d.baseline.mean))} (z {d.z:+.1f})."
                + _news2_note(vital, n2.parameters)
            ),
            value=round(d.value, 2), baseline=round(d.baseline.mean, 2), weight=weight,
            contribution=weight * max(0.5, min(abs(d.z) / W.Z_FULL_WEIGHT, 1.0)),
        ))
    factors += _cap(dev_factors, W.DEVIATION_CAP)

    # 4. Trends
    trend_factors = []
    for vital, t in trends.items():
        if not t.flagged:
            continue
        meta = W.VITAL_META[vital]
        weight = W.TREND_WEIGHT[vital]
        threshold = W.TREND_THRESHOLD[vital][1]
        verb = "rising" if t.slope_per_hr > 0 else "falling"
        rate = with_unit(vital, f"{abs(t.slope_per_hr):.1f}") + "/hr"
        trend_factors.append(Factor(
            factor=f"{vital}_trend", kind="trend",
            headline=f"{meta['short']} {verb} {rate}",
            message=f"{meta['label']} has been {verb} {rate} over the last {t.window_hr:g} h." + _news2_note(vital, n2.parameters),
            value=round(t.slope_per_hr, 2), baseline=None, weight=weight,
            contribution=weight * min(abs(t.slope_per_hr) / (threshold * W.TREND_FULL_MULTIPLE), 1.0),
        ))
    factors += _cap(trend_factors, W.TREND_CAP)

    # 5. Medication
    med_factors = []
    if adh.pct is not None and adh.pct < W.ADHERENCE_TARGET_PCT:
        total = adh.taken + adh.missed
        med_factors.append(Factor(
            factor="adherence", kind="adherence",
            headline=f"Adherence {adh.pct:.0f}%",
            message=f"Took {adh.taken} of {total} scheduled doses in the last {W.ADHERENCE_WINDOW_DAYS} days ({adh.pct:.0f}%).",
            value=round(adh.pct, 1), baseline=W.ADHERENCE_TARGET_PCT, weight=W.ADHERENCE_MAX_POINTS,
            contribution=W.ADHERENCE_MAX_POINTS * (W.ADHERENCE_TARGET_PCT - adh.pct) / W.ADHERENCE_TARGET_PCT,
        ))
    missed_by_med: dict[str, int] = {}
    for d in adh.missed_critical_recent:
        missed_by_med[d.medication] = missed_by_med.get(d.medication, 0) + 1
    for med, count in missed_by_med.items():
        med_factors.append(Factor(
            factor=f"missed_{med.split()[0].lower()}", kind="medication",
            headline=f"Missed {med}",
            message=f"Missed {count} critical dose{'s' if count > 1 else ''} of {med} in the last {W.CRITICAL_DOSE_LOOKBACK_HOURS} h.",
            value=count, baseline=None, weight=W.CRITICAL_DOSE_POINTS, contribution=W.CRITICAL_DOSE_POINTS * count,
        ))
    factors += _cap(med_factors, W.MEDICATION_CAP)

    # 6. Symptoms
    sym_factors = []
    for key in symptoms_now:
        s = W.SYMPTOMS[key]
        sym_factors.append(Factor(
            factor=f"symptom_{key}", kind="symptom",
            headline=s["en"],
            message=f"Reported {s['en'].lower()} in the last {W.SYMPTOM_LOOKBACK_HOURS} h" + (" — a red-flag symptom." if s["escalate"] else "."),
            value=None, baseline=None, weight=s["weight"], contribution=s["weight"],
        ))
    factors += _cap(sym_factors, W.SYMPTOM_CAP)

    raw = sum(f.contribution for f in factors)
    if raw > 100:
        _cap(factors, 100)
        raw = 100.0

    # 7. Escalation floors: never less alarming than NEWS2 / qSOFA / a red-flag symptom.
    floors = []
    if n2.total >= 7:
        floors.append((W.FLOOR_NEWS2_HIGH, "NEWS2 ≥ 7 requires emergency assessment."))
    elif n2.total >= 5:
        floors.append((W.FLOOR_NEWS2_MEDIUM, "NEWS2 5–6 requires urgent clinical review."))
    elif n2.any_three:
        floors.append((W.FLOOR_NEWS2_SINGLE_THREE, "A single NEWS2 parameter at 3 requires urgent ward-based review."))
    if q.flag:
        floors.append((W.FLOOR_QSOFA, "qSOFA ≥ 2 requires a sepsis screen."))
    if flags:
        labels = ", ".join(W.SYMPTOMS[k]["en"].lower() for k in flags)
        floors.append((W.FLOOR_RED_FLAG_SYMPTOM, f"Red-flag symptom reported ({labels})."))
    if floors:
        floor, reason = max(floors, key=lambda f: f[0])
        if floor > raw:
            factors.append(Factor(
                factor="escalation_floor", kind="escalation",
                headline="Escalation rule",
                message=f"Raised to at least {floor} (level {level_for(floor)}): {reason}",
                value=floor, baseline=None, weight=0, contribution=floor - raw,
            ))
            raw = float(floor)

    for f in factors:
        f.contribution = round(f.contribution, 1)
    factors.sort(key=lambda f: -f.contribution)
    score = int(math.floor(raw + 0.5))
    level = level_for(score)

    actions = [W.ACTION_TEXT[level]]
    if flags:
        actions.append(f"Red-flag symptom reported ({', '.join(W.SYMPTOMS[k]['en'].lower() for k in flags)}): assess now.")
    if q.flag:
        actions.append("qSOFA ≥ 2: screen for sepsis per local protocol.")
    for med in missed_by_med:
        actions.append(f"Confirm the missed {med} dose with the patient or nurse.")
    if n2.band in ("Medium", "High"):
        actions.append(f"NEWS2 guidance: {n2.response}")

    # Name the causes, not the rule that lifted the score to its floor.
    causes = [f for f in factors if f.kind != "escalation"] or factors
    summary = " · ".join(f.headline for f in causes[:2]) if causes else "Within this patient's normal range"

    return RiskResult(
        score=score, level=level, urgency=W.URGENCY[level], recommended_action=actions, summary=summary,
        factors=factors, news2=n2, qsofa=q, deviations=deviations, trends=trends, adherence=adh,
        active_symptoms=symptoms_now, baselines=baselines, computed_at=now,
    )
