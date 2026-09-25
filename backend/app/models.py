"""Database tables. Timestamps are naive UTC in simulated time (NaiveDatetime; the API adds the Z)."""

from __future__ import annotations

from pydantic import NaiveDatetime
from sqlalchemy import JSON, Column, Index
from sqlmodel import Field, SQLModel


class Patient(SQLModel, table=True):
    id: str = Field(primary_key=True)  # "P001"
    name: str
    age: int
    sex: str  # "M" | "F"
    conditions: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    ward: str
    bed: str
    language: str = "en"  # "en" | "hi"
    spo2_scale: int = 1  # NEWS2 SpO2 scale (2 = prescribed 88–92% target)
    # vital → {"mean": float, "std": float}: this patient's documented normal
    normals: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    notes: str = ""


class VitalReading(SQLModel, table=True):
    __table_args__ = (Index("ix_vital_patient_ts", "patient_id", "ts"),)

    id: int | None = Field(default=None, primary_key=True)
    patient_id: str = Field(foreign_key="patient.id")
    ts: NaiveDatetime
    hr: float
    spo2: float
    sbp: float
    dbp: float
    rr: float
    temp: float
    glucose: float | None = None
    on_oxygen: bool = False
    consciousness: str = "A"
    source: str = "sim"  # "seed" | "sim" | "manual"


class Medication(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    patient_id: str = Field(foreign_key="patient.id", index=True)
    name: str
    dose: str
    purpose: str
    times: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))  # ["08:00", "20:00"]
    critical: bool = False


class DoseEvent(SQLModel, table=True):
    __table_args__ = (Index("ix_dose_patient_time", "patient_id", "scheduled_at"),)

    id: int | None = Field(default=None, primary_key=True)
    medication_id: int = Field(foreign_key="medication.id")
    patient_id: str = Field(foreign_key="patient.id")
    scheduled_at: NaiveDatetime
    status: str = "pending"  # "pending" | "taken" | "missed"
    recorded_at: NaiveDatetime | None = None


class SymptomReport(SQLModel, table=True):
    __table_args__ = (Index("ix_symptom_patient_ts", "patient_id", "ts"),)

    id: int | None = Field(default=None, primary_key=True)
    patient_id: str = Field(foreign_key="patient.id")
    ts: NaiveDatetime
    symptom: str  # key into risk.weights.SYMPTOMS
    note: str = ""
    source: str = "patient"  # "patient" | "asha" | "staff" | "sim"
    resolved_at: NaiveDatetime | None = None  # set when the patient recovers; kept for the log


class RiskSnapshot(SQLModel, table=True):
    __table_args__ = (Index("ix_risk_patient_ts", "patient_id", "ts"),)

    id: int | None = Field(default=None, primary_key=True)
    patient_id: str = Field(foreign_key="patient.id")
    ts: NaiveDatetime
    score: int
    level: str
    news2: int
    qsofa: int


class Alert(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    patient_id: str = Field(foreign_key="patient.id", index=True)
    created_at: NaiveDatetime
    level: str
    prev_level: str
    score: int
    title: str
    summary: str
    factors: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    status: str = "new"  # "new" | "acknowledged" | "resolved"
    updated_at: NaiveDatetime | None = None  # last escalation
    acknowledged_at: NaiveDatetime | None = None
    resolved_at: NaiveDatetime | None = None
    note: str = ""
    acknowledged_by: str = ""
