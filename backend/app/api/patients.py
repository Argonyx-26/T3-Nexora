from __future__ import annotations

from datetime import timedelta

import asyncio

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, col, select

from ..db import engine, get_session
from ..models import Alert, Appointment, DailyCheckin, DoctorNote, DoseEvent, Medication, Patient, RiskSnapshot, SymptomReport, VitalReading
from ..risk import weights as W
from ..risk.adherence import effective_status
from ..risk.types import Dose
from ..explain.assistant import HealthFacts, assistant
from ..explain.service import explainer
from ..schemas import (
    ChatIn,
    ChatOut,
    CheckinIn,
    CheckinOut,
    TimelineEvent,
    DoseOut,
    ExplanationOut,
    MedicationOut,
    PatientSummary,
    RiskOut,
    RiskPointOut,
    SymptomLogOut,
    SymptomsIn,
    VitalOut,
    VitalsIn,
)
from ..services.hub import hub
from ..services.serialize import risk_brief, risk_out
from ..seed.physiology import IST
from ..sim.simulator import sim

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


def summary_of(patient_id: str) -> PatientSummary:
    ps = sim.get(patient_id)
    if ps is None:
        raise HTTPException(404, f"No patient {patient_id}")
    last = ps.history[-1]
    latest = VitalOut(ts=last.ts, hr=last.hr, spo2=last.spo2, sbp=last.sbp, dbp=last.dbp, rr=last.rr, temp=last.temp,
                      glucose=last.glucose, on_oxygen=last.on_oxygen, consciousness=last.consciousness, source="sim")
    return PatientSummary(**ps.info, risk=risk_brief(ps.risk), latest=latest)


@router.get("", response_model=list[PatientSummary], summary="All patients, highest risk first (live)")
def list_patients():
    sim.ensure_loaded()
    out = [summary_of(pid) for pid in list(sim.states)]
    out.sort(key=lambda x: -x.risk.score)
    return out


@router.get("/{patient_id}", response_model=PatientSummary, summary="One patient with current risk (live)")
def patient_detail(patient_id: str):
    return summary_of(patient_id)


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


@router.get("/{patient_id}/risk", response_model=RiskOut, summary="Full explainable risk assessment (live)")
def patient_risk(patient_id: str):
    ps = sim.get(patient_id)
    if ps is None:
        raise HTTPException(404, f"No patient {patient_id}")
    return risk_out(patient_id, ps.risk)


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


@router.get("/{patient_id}/symptoms", response_model=list[SymptomLogOut], summary="Symptom log, newest first (7 days)")
def symptom_log(patient_id: str, s: Session = Depends(get_session)):
    get_patient(s, patient_id)
    since = sim.now - timedelta(days=7)
    rows = s.exec(
        select(SymptomReport)
        .where(SymptomReport.patient_id == patient_id, SymptomReport.ts >= since)
        .order_by(col(SymptomReport.ts).desc())
    ).all()
    return [
        SymptomLogOut(id=r.id, ts=r.ts, symptom=r.symptom, label_en=W.SYMPTOMS.get(r.symptom, {}).get("en", r.symptom),
                      label_hi=W.SYMPTOMS.get(r.symptom, {}).get("hi", r.symptom),
                      red_flag=W.SYMPTOMS.get(r.symptom, {}).get("escalate", False), source=r.source, note=r.note,
                      resolved_at=r.resolved_at, severity=r.severity, duration=r.duration, frequency=r.frequency)
        for r in rows
    ]


@router.post("/{patient_id}/symptoms", response_model=RiskOut, summary="Report symptoms; the patient is re-scored at once")
async def report_symptoms(patient_id: str, body: SymptomsIn):
    if sim.get(patient_id) is None:
        raise HTTPException(404, f"No patient {patient_id}")
    unknown = [k for k in body.symptoms if k not in W.SYMPTOMS]
    if unknown or not body.symptoms:
        raise HTTPException(422, f"Unknown or empty symptoms: {unknown or '[]'}. Known: {sorted(W.SYMPTOMS)}")
    if body.source not in ("patient", "asha", "staff"):
        raise HTTPException(422, "source must be patient, asha or staff")
    details = {"severity": body.severity, "duration": body.duration, "frequency": body.frequency}
    message = await asyncio.to_thread(sim.report_symptoms, patient_id, list(dict.fromkeys(body.symptoms)), body.source, body.note[:500], details)
    await hub.broadcast(message)
    return risk_out(patient_id, sim.get(patient_id).risk)


@router.get("/{patient_id}/explanation", response_model=ExplanationOut,
            summary="Plain-language explanation for the doctor and the patient (Gemini, or built-in templates)")
async def explanation(patient_id: str, lang: Literal["en", "hi"] = "en"):
    ps = sim.get(patient_id)
    if ps is None:
        raise HTTPException(404, f"No patient {patient_id}")
    out = await explainer.explain(patient_id, ps.risk, lang, sim.now)
    return ExplanationOut(patient_id=patient_id, **out, disclaimer=W.DISCLAIMER)


@router.post("/{patient_id}/vitals", response_model=RiskOut, summary="Log a reading by hand; the patient is re-scored at once")
async def log_vitals(patient_id: str, body: VitalsIn):
    if sim.get(patient_id) is None:
        raise HTTPException(404, f"No patient {patient_id}")
    if body.source not in ("patient", "asha", "staff"):
        raise HTTPException(422, "source must be patient, asha or staff")
    values = body.model_dump(exclude_none=True, exclude={"source"})
    if not values:
        raise HTTPException(422, "Enter at least one reading")
    message = await asyncio.to_thread(sim.add_manual_reading, patient_id, values, body.source)
    await hub.broadcast(message)
    return risk_out(patient_id, sim.get(patient_id).risk)


VITAL_UNITS = {"hr": "bpm", "spo2": "%", "temp": "°C", "glucose": "mg/dL"}


def health_facts(patient_id: str) -> HealthFacts:
    """The assistant's view of one patient: health facts only, no name, ID, bed or age."""
    ps = sim.get(patient_id)
    risk = ps.risk
    last = ps.history[-1]

    def normal(v: str, decimals: int = 0) -> str | None:
        b = risk.baselines.get(v)
        if not b:
            return None
        lo, hi = b.mean - 2 * b.std, b.mean + 2 * b.std
        return f"{lo:.{decimals}f}–{hi:.{decimals}f}"

    readings = {v: {"value": round(getattr(last, v), 1 if v == "temp" else 0), "unit": VITAL_UNITS[v], "normal": normal(v, 1 if v == "temp" else 0)}
                for v in ("hr", "spo2", "temp", "glucose") if getattr(last, v) is not None}
    readings = {k: {**r, "value": int(r["value"]) if k != "temp" else r["value"]} for k, r in readings.items()}
    readings["bp"] = {"value": f"{round(last.sbp)}/{round(last.dbp)}", "unit": "mmHg", "normal": None}
    with Session(engine) as s:
        meds = s.exec(select(Medication).where(Medication.patient_id == patient_id)).all()
    upcoming = sorted((d for d in ps.doses if d.status == "pending" and d.scheduled_at >= sim.now), key=lambda d: d.scheduled_at)
    nxt = upcoming[0] if upcoming else None
    labels = [W.SYMPTOMS.get(r.key, {}).get("en", r.key) for r in sorted(ps.symptoms, key=lambda r: r.ts, reverse=True)
              if r.ts >= sim.now - timedelta(days=7)]
    return HealthFacts(
        level=risk.level, score=risk.score, urgency=risk.urgency,
        factors=[f.message for f in risk.factors if f.contribution > 0][:4],
        conditions=list(ps.info.get("conditions", [])),
        readings=readings,
        medicines=[{"name": m.name, "dose": m.dose, "purpose": m.purpose, "times": m.times, "critical": m.critical} for m in meds],
        next_dose={"name": nxt.medication, "time": (nxt.scheduled_at + IST).strftime("%H:%M")} if nxt else None,
        adherence_pct=risk.adherence.pct,
        symptoms=list(dict.fromkeys(labels)),
    )


@router.post("/{patient_id}/chat", response_model=ChatOut,
             summary="Ask AYU's health assistant about your own readings, medicines and symptoms")
async def chat(patient_id: str, body: ChatIn):
    if sim.get(patient_id) is None:
        raise HTTPException(404, f"No patient {patient_id}")
    facts = await asyncio.to_thread(health_facts, patient_id)
    facts.history = [t.model_dump() for t in body.history]
    out = await assistant.reply(facts, body.message, body.lang)
    return ChatOut(**out, disclaimer=W.DISCLAIMER)


# ---------------------------------------------------------------- daily check-ins


@router.post("/{patient_id}/checkins", response_model=CheckinOut, summary="A quick daily check-in: mood, energy, sleep (+ optional symptoms)")
async def add_checkin(patient_id: str, body: CheckinIn):
    if sim.get(patient_id) is None:
        raise HTTPException(404, f"No patient {patient_id}")
    unknown = [k for k in body.symptoms if k not in W.SYMPTOMS]
    if unknown:
        raise HTTPException(422, f"Unknown symptoms: {unknown}")

    def save() -> DailyCheckin:
        with Session(engine) as s:
            row = DailyCheckin(patient_id=patient_id, ts=sim.now, mood=body.mood, energy=body.energy, sleep=body.sleep,
                               note=body.note.strip(), source=body.source)
            s.add(row)
            s.commit()
            s.refresh(row)
            return row

    row = await asyncio.to_thread(save)
    if body.symptoms:
        message = await asyncio.to_thread(sim.report_symptoms, patient_id, list(dict.fromkeys(body.symptoms)), body.source,
                                          "From the daily check-in")
        await hub.broadcast(message)
    return CheckinOut(**row.model_dump())


@router.get("/{patient_id}/checkins", response_model=list[CheckinOut], summary="Daily check-ins, newest first")
def list_checkins(patient_id: str, days: int = Query(7, ge=1, le=30), s: Session = Depends(get_session)):
    get_patient(s, patient_id)
    rows = s.exec(
        select(DailyCheckin)
        .where(DailyCheckin.patient_id == patient_id, DailyCheckin.ts >= sim.now - timedelta(days=days))
        .order_by(col(DailyCheckin.ts).desc())
    ).all()
    return [CheckinOut(**r.model_dump()) for r in rows]


# ---------------------------------------------------------------- personal health timeline

LATE = timedelta(minutes=30)
PERSIST = 3  # a level must hold this many readings to count as a change of status


@router.get("/{patient_id}/timeline", response_model=list[TimelineEvent], summary="Important health events, newest first")
def timeline(patient_id: str, hours: int = Query(48, ge=1, le=720), audience: Literal["doctor", "patient"] = "doctor",
             s: Session = Depends(get_session)):
    get_patient(s, patient_id)
    now = sim.now
    since = now - timedelta(hours=hours)
    events: list[TimelineEvent] = []

    # Status changes: a new level that held for PERSIST readings, not a one-reading blip.
    snaps = s.exec(
        select(RiskSnapshot).where(RiskSnapshot.patient_id == patient_id, RiskSnapshot.ts >= since - timedelta(minutes=30))
        .order_by(col(RiskSnapshot.ts))
    ).all()
    if snaps:
        cur = snaps[0].level
        run_level, run_start, run_len = None, None, 0
        for r in snaps[1:]:
            if r.level == cur:
                run_level, run_len = None, 0
                continue
            if r.level == run_level:
                run_len += 1
            else:
                run_level, run_start, run_len = r.level, r, 1
            if run_len >= PERSIST:
                if run_start.ts >= since:
                    events.append(TimelineEvent(ts=run_start.ts, kind="status", sub=run_level, level=run_level, prev_level=cur,
                                                values={"score": float(run_start.score), "news2": float(run_start.news2)}))
                cur, run_level, run_len = run_level, None, 0

    for r in s.exec(select(SymptomReport).where(SymptomReport.patient_id == patient_id, SymptomReport.ts >= since)).all():
        meta = W.SYMPTOMS.get(r.symptom, {})
        events.append(TimelineEvent(ts=r.ts, kind="symptom", symptom=r.symptom, label_en=meta.get("en", r.symptom),
                                    label_hi=meta.get("hi", r.symptom), severity=r.severity, source=r.source, note=r.note,
                                    level="Critical" if meta.get("escalate") else None))

    meds = {m.id: m.name for m in s.exec(select(Medication).where(Medication.patient_id == patient_id)).all()}
    doses = s.exec(
        select(DoseEvent).where(DoseEvent.patient_id == patient_id, DoseEvent.scheduled_at >= since, DoseEvent.scheduled_at <= now)
    ).all()
    for d in doses:
        status = effective_status(Dose(meds.get(d.medication_id, ""), d.scheduled_at, d.status), now)
        if status == "pending":
            continue
        if status == "taken" and d.recorded_at and d.recorded_at - d.scheduled_at > LATE:
            status = "delayed"
        events.append(TimelineEvent(ts=d.recorded_at or d.scheduled_at, kind="dose", sub=status, medicine=meds.get(d.medication_id, "")))

    manual = s.exec(
        select(VitalReading).where(VitalReading.patient_id == patient_id, VitalReading.ts >= since,
                                   col(VitalReading.source).in_(["patient", "asha", "staff", "report"]))
    ).all()
    for v in manual:
        events.append(TimelineEvent(ts=v.ts, kind="reading", source=v.source,
                                    values={k: float(getattr(v, k)) for k in ("hr", "spo2", "sbp", "dbp", "temp") if getattr(v, k) is not None}))

    for a in s.exec(select(Alert).where(Alert.patient_id == patient_id, Alert.created_at >= since - timedelta(hours=hours))).all():
        if a.created_at >= since:
            events.append(TimelineEvent(ts=a.created_at, kind="alert", sub="raised", level=a.level if not a.updated_at else a.prev_level or a.level))
        if a.updated_at and a.updated_at >= since:
            events.append(TimelineEvent(ts=a.updated_at, kind="alert", sub="escalated", level=a.level, prev_level=a.prev_level))
        if a.acknowledged_at and a.acknowledged_at >= since:
            events.append(TimelineEvent(ts=a.acknowledged_at, kind="alert", sub="acknowledged", level=a.level, note=a.note, by=a.acknowledged_by))
        if a.resolved_at and a.resolved_at >= since:
            events.append(TimelineEvent(ts=a.resolved_at, kind="alert", sub="resolved", level=a.level))

    for c in s.exec(select(DailyCheckin).where(DailyCheckin.patient_id == patient_id, DailyCheckin.ts >= since)).all():
        events.append(TimelineEvent(ts=c.ts, kind="checkin", mood=c.mood, values={"energy": float(c.energy), "sleep": float(c.sleep)},
                                    note=c.note, source=c.source))

    notes = select(DoctorNote).where(DoctorNote.patient_id == patient_id, DoctorNote.ts >= since)
    if audience == "patient":
        notes = notes.where(DoctorNote.visible == True)  # noqa: E712 (SQL expression)
    for n in s.exec(notes).all():
        events.append(TimelineEvent(ts=n.ts, kind="note", sub=n.kind, note=n.text, by=n.author,
                                    source="visible" if n.visible else "private"))

    for a in s.exec(select(Appointment).where(Appointment.patient_id == patient_id, Appointment.created_at >= since)).all():
        events.append(TimelineEvent(ts=a.updated_at or a.created_at, kind="appointment", sub=a.status, note=a.reason,
                                    source=a.mode, by=a.requested_by))

    events.sort(key=lambda e: e.ts, reverse=True)
    return events[:400]
