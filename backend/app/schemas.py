"""API response shapes. These drive the OpenAPI docs at /docs and the frontend types."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from pydantic import BaseModel, PlainSerializer


def _iso_utc(d: datetime) -> str:
    return d.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


# Stored naive (UTC, simulated time); always sent with a Z.
UTC = Annotated[datetime, PlainSerializer(_iso_utc, return_type=str)]


class FactorOut(BaseModel):
    factor: str
    kind: str
    headline: str
    message: str
    value: float | None
    baseline: float | None
    weight: float
    contribution: float


class News2Out(BaseModel):
    total: int
    band: str
    parameters: dict[str, int]
    any_three: bool
    response: str


class QsofaOut(BaseModel):
    score: int
    criteria: dict[str, bool]
    flag: bool


class BaselineOut(BaseModel):
    mean: float
    std: float
    low: float  # mean − z_threshold·σ: the shaded band on the charts
    high: float
    n: int
    source: str


class DeviationOut(BaseModel):
    value: float
    z: float
    pct: float
    flagged: bool


class TrendOut(BaseModel):
    slope_per_hr: float
    t_stat: float
    n: int
    window_hr: float
    flagged: bool


class AdherenceOut(BaseModel):
    pct: float | None
    taken: int
    missed: int
    missed_critical_recent: list[str]


class RiskOut(BaseModel):
    patient_id: str
    score: int
    level: str
    urgency: str
    summary: str
    recommended_action: list[str]
    factors: list[FactorOut]
    news2: News2Out
    qsofa: QsofaOut
    baselines: dict[str, BaselineOut]
    deviations: dict[str, DeviationOut]
    trends: dict[str, TrendOut]
    adherence: AdherenceOut
    active_symptoms: list[str]
    computed_at: UTC
    disclaimer: str


class RiskBrief(BaseModel):
    score: int
    level: str
    urgency: str
    summary: str
    news2: int
    computed_at: UTC


class VitalOut(BaseModel):
    ts: UTC
    hr: float
    spo2: float
    sbp: float
    dbp: float
    rr: float
    temp: float
    glucose: float | None
    on_oxygen: bool
    consciousness: str
    source: str


class PatientOut(BaseModel):
    id: str
    name: str
    age: int
    sex: str
    conditions: list[str]
    ward: str
    bed: str
    language: str
    spo2_scale: int
    normals: dict[str, dict[str, float]]
    notes: str


class PatientSummary(PatientOut):
    risk: RiskBrief
    latest: VitalOut


class DoseOut(BaseModel):
    id: int
    medication_id: int
    scheduled_at: UTC
    status: str
    recorded_at: UTC | None


class MedicationOut(BaseModel):
    id: int
    name: str
    dose: str
    purpose: str
    times: list[str]
    critical: bool
    adherence_pct: float | None
    doses: list[DoseOut]


class RiskPointOut(BaseModel):
    ts: UTC
    score: int
    level: str
    news2: int
