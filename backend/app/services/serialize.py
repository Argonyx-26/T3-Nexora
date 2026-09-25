"""Engine results → API shapes."""

from __future__ import annotations

import math

from ..risk import RiskResult
from ..risk import weights as W
from ..schemas import (
    AdherenceOut,
    BaselineOut,
    DeviationOut,
    FactorOut,
    News2Out,
    QsofaOut,
    RiskBrief,
    RiskOut,
    TrendOut,
)


def _finite(x: float, limit: float = 999.0) -> float:
    if math.isnan(x):
        return 0.0
    return max(-limit, min(limit, x))


def risk_out(patient_id: str, r: RiskResult) -> RiskOut:
    return RiskOut(
        patient_id=patient_id,
        score=r.score,
        level=r.level,
        urgency=r.urgency,
        summary=r.summary,
        recommended_action=r.recommended_action,
        factors=[FactorOut(**f.to_dict()) for f in r.factors],
        news2=News2Out(total=r.news2.total, band=r.news2.band, parameters=r.news2.parameters,
                       any_three=r.news2.any_three, response=r.news2.response),
        qsofa=QsofaOut(score=r.qsofa.score, criteria=r.qsofa.criteria, flag=r.qsofa.flag),
        baselines={
            v: BaselineOut(mean=round(b.mean, 2), std=round(b.std, 2), low=round(b.mean - W.Z_THRESHOLD * b.std, 2),
                           high=round(b.mean + W.Z_THRESHOLD * b.std, 2), n=b.n, source=b.source)
            for v, b in r.baselines.items()
        },
        deviations={
            v: DeviationOut(value=round(d.value, 2), z=round(_finite(d.z), 2), pct=round(d.pct, 3), flagged=d.flagged)
            for v, d in r.deviations.items()
        },
        trends={
            v: TrendOut(slope_per_hr=round(t.slope_per_hr, 3), t_stat=round(_finite(t.t_stat), 2), n=t.n,
                        window_hr=t.window_hr, flagged=t.flagged)
            for v, t in r.trends.items()
        },
        adherence=AdherenceOut(
            pct=None if r.adherence.pct is None else round(r.adherence.pct, 1),
            taken=r.adherence.taken,
            missed=r.adherence.missed,
            missed_critical_recent=[d.medication for d in r.adherence.missed_critical_recent],
        ),
        active_symptoms=r.active_symptoms,
        computed_at=r.computed_at,
        disclaimer=W.DISCLAIMER,
    )


def risk_brief(r: RiskResult) -> RiskBrief:
    return RiskBrief(score=r.score, level=r.level, urgency=r.urgency, summary=r.summary,
                     news2=r.news2.total, computed_at=r.computed_at)
