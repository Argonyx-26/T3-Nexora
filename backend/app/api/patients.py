from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, col, select

from ..db import get_session
from ..models import DoseEvent, Medication, Patient, RiskSnapshot, VitalReading
from ..risk import assess
from ..risk.adherence import effective_status
from ..risk.types import Dose
from ..schemas import DoseOut, MedicationOut, PatientOut, PatientSummary, RiskOut, RiskPointOut, VitalOut
from ..services.context import load_context
from ..services.serialize import risk_brief, risk_out

router = APIRouter(prefix="/patients", tags=["Patients"])

RANGE_PATTERN = r"^\d{1,3}[hd]$"


def parse_range(value: str) -> timedelta:
    n, unit = int(value[:-1]), value[-1]
    span = timedelta(hours=n) if unit == "h" else timedelta(days=n)
    return min(span, timedelta(days=7))


def get_patient(s: Session, patient_id: str) -> Patient:
    p = s.get(Patient, patient_id)
    if p is None:
        raise HTTPException(404, f"No patient {patient_id}")
    return p


def latest_reading(s: Session, patient_id: str) -> VitalReading:
    return s.exec(
        select(VitalReading).where(VitalReading.patient_id == patient_id).order_by(col(VitalReading.ts).desc()).limit(1)
    ).one()


@router.get("", response_model=list[PatientSummary], summary="All patients, highest risk first")
def list_patients(s: Session = Depends(get_session)):
    out = []
    for p in s.exec(select(Patient)).all():
        r = assess(load_context(s, p.id))
        out.append(PatientSummary(**p.model_dump(), risk=risk_brief(r), latest=VitalOut(**latest_reading(s, p.id).model_dump())))
    out.sort(key=lambda x: -x.risk.score)
    return out


@router.get("/{patient_id}", response_model=PatientSummary, summary="One patient with current risk")
def patient_detail(patient_id: str, s: Session = Depends(get_session)):
    p = get_patient(s, patient_id)
    r = assess(load_context(s, patient_id))
    return PatientSummary(**p.model_dump(), risk=risk_brief(r), latest=VitalOut(**latest_reading(s, patient_id).model_dump()))


@router.get("/{patient_id}/vitals", response_model=list[VitalOut], summary="Vitals history, oldest first")
def patient_vitals(
    patient_id: str,
    range: str = Query("6h", pattern=RANGE_PATTERN, description="How far back, e.g. 6h, 24h, 7d (max 7d)"),
    max_points: int = Query(600, ge=10, le=5000, description="Evenly thin the series to at most this many points"),
    s: Session = Depends(get_session),
):
    get_patient(s, patient_id)
    end = latest_reading(s, patient_id).ts
    rows = s.exec(
        select(VitalReading)
        .where(VitalReading.patient_id == patient_id, VitalReading.ts >= end - parse_range(range))
        .order_by(col(VitalReading.ts))
    ).all()
    if len(rows) > max_points:
        stride = -(-len(rows) // max_points)
        rows = rows[::-1][::stride][::-1]  # keep the newest reading
    return [VitalOut(**r.model_dump()) for r in rows]


@router.get("/{patient_id}/risk", response_model=RiskOut, summary="Full explainable risk assessment")
def patient_risk(patient_id: str, s: Session = Depends(get_session)):
    get_patient(s, patient_id)
    return risk_out(patient_id, assess(load_context(s, patient_id)))


@router.get("/{patient_id}/risk/history", response_model=list[RiskPointOut], summary="Risk score over time")
def patient_risk_history(
    patient_id: str,
    range: str = Query("24h", pattern=RANGE_PATTERN),
    s: Session = Depends(get_session),
):
    get_patient(s, patient_id)
    end = latest_reading(s, patient_id).ts
    rows = s.exec(
        select(RiskSnapshot)
        .where(RiskSnapshot.patient_id == patient_id, RiskSnapshot.ts >= end - parse_range(range))
        .order_by(col(RiskSnapshot.ts))
    ).all()
    return [RiskPointOut(**r.model_dump()) for r in rows]


@router.get("/{patient_id}/medications", response_model=list[MedicationOut], summary="Medications with the last 7 days of doses")
def patient_medications(patient_id: str, s: Session = Depends(get_session)):
    get_patient(s, patient_id)
    now = latest_reading(s, patient_id).ts
    meds = s.exec(select(Medication).where(Medication.patient_id == patient_id)).all()
    out = []
    for m in meds:
        doses = s.exec(
            select(DoseEvent)
            .where(DoseEvent.medication_id == m.id, DoseEvent.scheduled_at >= now - timedelta(days=7),
                   DoseEvent.scheduled_at <= now + timedelta(days=1))
            .order_by(col(DoseEvent.scheduled_at))
        ).all()
        statuses = [effective_status(Dose(m.name, d.scheduled_at, d.status), now) for d in doses if d.scheduled_at <= now]
        taken = statuses.count("taken")
        counted = taken + statuses.count("missed")
        dose_out = []
        for d in doses:
            status = effective_status(Dose(m.name, d.scheduled_at, d.status), now) if d.scheduled_at <= now else d.status
            dose_out.append(DoseOut(**{**d.model_dump(), "status": status}))
        out.append(MedicationOut(
            id=m.id, name=m.name, dose=m.dose, purpose=m.purpose, times=m.times, critical=m.critical,
            adherence_pct=round(100 * taken / counted, 1) if counted else None, doses=dose_out,
        ))
    return out
