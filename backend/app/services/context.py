"""Glue between the database and the pure risk engine."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlmodel import Session, col, select

from ..models import DoseEvent, Medication, Patient, SymptomReport, VitalReading
from ..risk import Dose, PatientContext, Reading, SymptomEntry
from ..risk import weights as W


def to_reading(v: VitalReading) -> Reading:
    return Reading(ts=v.ts, hr=v.hr, spo2=v.spo2, sbp=v.sbp, dbp=v.dbp, rr=v.rr, temp=v.temp,
                   glucose=v.glucose, on_oxygen=v.on_oxygen, consciousness=v.consciousness)


def declared_normals(p: Patient) -> dict[str, tuple[float, float]]:
    return {k: (float(v["mean"]), float(v["std"])) for k, v in p.normals.items()}


def load_doses(s: Session, patient_id: str, since: datetime) -> list[Dose]:
    rows = s.exec(
        select(DoseEvent, Medication)
        .join(Medication, col(DoseEvent.medication_id) == col(Medication.id))
        .where(DoseEvent.patient_id == patient_id, DoseEvent.scheduled_at >= since)
        .order_by(col(DoseEvent.scheduled_at))
    ).all()
    return [Dose(medication=m.name, scheduled_at=d.scheduled_at, status=d.status, critical=m.critical) for d, m in rows]


def load_context(s: Session, patient_id: str, now: datetime | None = None) -> PatientContext:
    """Everything the engine needs for one patient, as of `now` (default: their latest reading)."""
    patient = s.get(Patient, patient_id)
    if patient is None:
        raise KeyError(patient_id)
    q = select(VitalReading).where(VitalReading.patient_id == patient_id)
    if now is not None:
        q = q.where(VitalReading.ts <= now)
    latest = s.exec(q.order_by(col(VitalReading.ts).desc()).limit(1)).first()
    if latest is None:
        raise LookupError(f"{patient_id} has no readings")
    now = latest.ts
    since = now - timedelta(hours=W.BASELINE_WINDOW_HOURS)
    readings = s.exec(
        select(VitalReading)
        .where(VitalReading.patient_id == patient_id, VitalReading.ts >= since, VitalReading.ts <= now)
        .order_by(col(VitalReading.ts))
    ).all()
    symptoms = s.exec(
        select(SymptomReport).where(
            SymptomReport.patient_id == patient_id,
            SymptomReport.ts >= now - timedelta(hours=W.SYMPTOM_LOOKBACK_HOURS),
            SymptomReport.ts <= now,
            SymptomReport.resolved_at == None,  # noqa: E711
        )
    ).all()
    return PatientContext(
        patient_id=patient_id,
        history=[to_reading(r) for r in readings],
        declared_normals=declared_normals(patient),
        doses=load_doses(s, patient_id, now - timedelta(days=W.ADHERENCE_WINDOW_DAYS)),
        symptoms=[SymptomEntry(ts=x.ts, key=x.symptom) for x in symptoms],
        spo2_scale=patient.spo2_scale,
    )
