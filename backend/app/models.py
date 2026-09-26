"""Database tables. Timestamps are naive UTC in simulated time (NaiveDatetime; the API adds the Z)."""

from __future__ import annotations

from pydantic import NaiveDatetime
from sqlalchemy import JSON, Column, Index
from sqlmodel import Field, SQLModel


class Hospital(SQLModel, table=True):
    """One care site on the AYU network: a hospital, a primary health centre or a clinic."""

    id: str = Field(primary_key=True)  # "H01"
    name: str
    city: str
    kind: str = "hospital"  # "hospital" | "phc" | "clinic"


class Doctor(SQLModel, table=True):
    id: str = Field(primary_key=True)  # "D01"
    name: str
    specialty: str  # "General Medicine" | "Cardiology" | "Pulmonology" | "Endocrinology" | "Surgery" | ...
    hospital_id: str = Field(foreign_key="hospital.id", index=True)
    on_duty: bool = True
    max_patients: int = 6


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
    # past medical history: [{"year": "2018", "event": "Type 2 diabetes diagnosed"}, ...]
    history: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    # "demo": the simulated cohort (vitals stream every 5 min) · "intake": added by a clinician from a report or by hand —
    # only real readings, never simulated ones
    source: str = "demo"
    hospital_id: str = "H01"
    doctor_id: str = ""  # "" = not yet assigned
    assigned_reason: str = ""
    registered_by: str = "seed"  # "seed" | "clinician" | "self"


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
    severity: str = ""  # "" | "mild" | "moderate" | "severe" — patient-reported, for the log and trends
    duration: str = ""  # "" | "today" | "days" | "week" (under a day / 1–3 days / longer)
    frequency: str = ""  # "" | "once" | "on_off" | "constant"


class DailyCheckin(SQLModel, table=True):
    """A quick daily check-in from the patient (or an ASHA worker): how they feel, in a few taps."""

    __table_args__ = (Index("ix_checkin_patient_ts", "patient_id", "ts"),)

    id: int | None = Field(default=None, primary_key=True)
    patient_id: str = Field(foreign_key="patient.id")
    ts: NaiveDatetime
    mood: int  # 1 (awful) … 5 (great)
    energy: int  # 1 low · 2 okay · 3 good
    sleep: int  # 1 poor · 2 okay · 3 good
    note: str = ""
    source: str = "patient"


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


class DoctorNote(SQLModel, table=True):
    """A clinician's note on a patient; `visible` ones (and follow-up instructions) are shown to the patient."""

    __table_args__ = (Index("ix_note_patient_ts", "patient_id", "ts"),)

    id: int | None = Field(default=None, primary_key=True)
    patient_id: str = Field(foreign_key="patient.id")
    ts: NaiveDatetime
    author: str = "Doctor"
    kind: str = "note"  # "note" | "followup"
    text: str
    visible: bool = True
    follow_up_on: str = ""  # an ISO date for follow-up instructions, else ""


class Appointment(SQLModel, table=True):
    """An appointment request (from the patient) or booking (from the doctor), in person or by video."""

    id: int | None = Field(default=None, primary_key=True)
    patient_id: str = Field(foreign_key="patient.id", index=True)
    created_at: NaiveDatetime
    requested_by: str = "patient"  # "patient" | "doctor"
    reason: str = ""
    preferred: str = ""  # free text from the patient: "tomorrow morning"
    mode: str = "in_person"  # "in_person" | "video"
    status: str = "requested"  # "requested" | "confirmed" | "declined" | "done"
    scheduled_for: NaiveDatetime | None = None
    video_url: str = ""
    updated_at: NaiveDatetime | None = None
