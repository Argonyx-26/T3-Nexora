"""Plain data types for the risk engine. No database, no web framework."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime


@dataclass(frozen=True)
class Reading:
    ts: datetime
    hr: float
    spo2: float
    sbp: float
    dbp: float
    rr: float
    temp: float
    glucose: float | None = None
    on_oxygen: bool = False
    consciousness: str = "A"  # A = alert; C = new confusion; V / P / U

    def get(self, vital: str) -> float | None:
        return getattr(self, vital)


@dataclass(frozen=True)
class Dose:
    medication: str
    scheduled_at: datetime
    status: str  # "taken" | "missed" | "pending"
    critical: bool = False


@dataclass(frozen=True)
class SymptomEntry:
    ts: datetime
    key: str


@dataclass(frozen=True)
class Baseline:
    mean: float
    std: float
    n: int
    source: str  # "history" (learned) | "declared" (clinician-set normals)


@dataclass
class PatientContext:
    patient_id: str
    history: list[Reading]  # oldest → newest; the last one is "now"
    declared_normals: dict[str, tuple[float, float]] = field(default_factory=dict)  # vital → (mean, std)
    doses: list[Dose] = field(default_factory=list)
    symptoms: list[SymptomEntry] = field(default_factory=list)
    spo2_scale: int = 1  # 2 = NEWS2 scale 2, for prescribed 88–92% targets (e.g. COPD)
    baselines: dict[str, Baseline] | None = None  # pass precomputed ones to skip the work
    # "personal": declared normals are this patient's own (clinician-set) · "typical": a population range, used
    # for a newly added patient until AYU has learned their own baseline from their readings
    normals_kind: str = "personal"

    @property
    def now(self) -> datetime:
        return self.history[-1].ts


@dataclass
class News2Result:
    total: int
    band: str  # "Low" | "Low-Medium" | "Medium" | "High"
    parameters: dict[str, int]
    any_three: bool
    response: str


@dataclass
class QsofaResult:
    score: int
    criteria: dict[str, bool]
    flag: bool


@dataclass
class Deviation:
    vital: str
    value: float
    baseline: Baseline
    z: float
    pct: float
    flagged: bool


@dataclass
class Trend:
    vital: str
    slope_per_hr: float
    t_stat: float
    n: int
    window_hr: float
    flagged: bool


@dataclass
class AdherenceResult:
    pct: float | None
    taken: int
    missed: int
    missed_critical_recent: list[Dose]


@dataclass
class Factor:
    factor: str  # stable id, e.g. "spo2_trend"
    kind: str  # news2 | qsofa | baseline | trend | adherence | medication | symptom | escalation
    headline: str  # a few words for a card
    message: str  # one full sentence for the explainability panel
    value: float | None
    baseline: float | None
    weight: float
    contribution: float

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class RiskResult:
    score: int
    level: str
    urgency: str
    recommended_action: list[str]
    summary: str
    factors: list[Factor]
    news2: News2Result
    qsofa: QsofaResult
    deviations: dict[str, Deviation]
    trends: dict[str, Trend]
    adherence: AdherenceResult
    active_symptoms: list[str]
    baselines: dict[str, Baseline]
    computed_at: datetime
