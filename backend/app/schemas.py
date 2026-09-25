"""API response shapes. These drive the OpenAPI docs at /docs and the frontend types."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from pydantic import BaseModel, Field, PlainSerializer


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


# --- Phase 2: live simulator, alerts ------------------------------------------------


class AlertOut(BaseModel):
    id: int
    patient_id: str
    patient_name: str
    bed: str
    created_at: UTC
    updated_at: UTC | None
    level: str
    prev_level: str
    score: int
    title: str
    summary: str
    factors: list[FactorOut]
    status: str
    acknowledged_at: UTC | None
    resolved_at: UTC | None
    note: str
    acknowledged_by: str
    disclaimer: str


class LiveRisk(RiskBrief):
    alert_level: str  # the level alerts are held at (rises at once, drops only after it stays lower)
    qsofa_flag: bool
    top_factors: list[str]


class LiveUpdate(BaseModel):
    patient_id: str
    vitals: VitalOut
    risk: LiveRisk
    scenario: str | None


class SimState(BaseModel):
    sim_time: UTC
    speed: int
    paused: bool
    running: bool
    tick_seconds: float
    minutes_per_tick: int
    scenarios: dict[str, str]  # patient_id → active scenario


class ScenarioIn(BaseModel):
    patient_id: str
    scenario: str


class SpeedIn(BaseModel):
    speed: int


class NoteIn(BaseModel):
    note: str = ""
    by: str = "Doctor"


class SymptomsIn(BaseModel):
    symptoms: list[str]
    note: str = ""
    source: str = "patient"  # "patient" | "asha" | "staff"


class DoseIn(BaseModel):
    dose_id: int
    status: str  # "taken" | "missed"


class SymptomLogOut(BaseModel):
    id: int
    ts: UTC
    symptom: str
    label_en: str
    label_hi: str
    red_flag: bool
    source: str
    note: str
    resolved_at: UTC | None


# --- Phase 4: explanations, manual readings ------------------------------------------


class ExplanationOut(BaseModel):
    patient_id: str
    lang: str
    level: str
    score: int
    doctor: str  # 2-3 sentences for the clinician
    patient: str  # one plain sentence for the patient
    urgency: str
    source: str  # "gemini" | "template"
    model: str | None
    generated_at: UTC
    disclaimer: str


class VitalsIn(BaseModel):
    """A reading typed in by the patient, an ASHA worker or staff. Leave out what wasn't measured."""

    hr: float | None = Field(None, ge=20, le=250)
    spo2: float | None = Field(None, ge=50, le=100)
    sbp: float | None = Field(None, ge=50, le=260)
    dbp: float | None = Field(None, ge=30, le=160)
    rr: float | None = Field(None, ge=4, le=60)
    temp: float | None = Field(None, ge=32, le=43)
    glucose: float | None = Field(None, ge=20, le=600)
    source: str = "patient"  # "patient" | "asha" | "staff"
