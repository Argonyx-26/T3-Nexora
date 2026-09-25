"""The doctor's side: per-patient insights (confidence, data quality, sudden changes,
missed-dose patterns, mood), the ward-wide review queue, notes and follow-ups the
patient can see, and appointment requests (in person or by video)."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlmodel import Session, col, select

from ..db import engine, get_session
from ..models import Alert, Appointment, DailyCheckin, DoctorNote, DoseEvent, Medication, Patient
from ..risk.adherence import effective_status
from ..risk.types import Dose
from ..schemas import UTC
from ..services.insights import confidence, data_quality, missed_patterns, mood_changes, sudden_changes
from ..sim.simulator import sim

router = APIRouter(tags=["Doctor"])

PRIORITY = {"Critical": "Critical", "Warning": "High", "Watch": "Moderate"}
RANK = {"Critical": 0, "High": 1, "Moderate": 2, None: 3}


class QualityOut(BaseModel):
    label: str
    completeness: float
    last_reading_min: float
    baseline_coverage: float
    notes: list[str]


class InsightsOut(BaseModel):
    patient_id: str
    level: str
    score: int
    confidence: int
    confidence_reasons: list[str]
    data_quality: QualityOut
    sudden_changes: list[dict]
    missed_patterns: list[dict]
    mood: dict
    mood_changes: list[dict]
    needs_review: list[str]


class QueueItem(BaseModel):
    patient_id: str
    name: str
    bed: str
    ward: str
    priority: str | None  # "Critical" | "High" | "Moderate" | None (nothing to review)
    level: str
    score: int
    news2: int
    confidence: int
    data_quality: str
    factors: list[dict]
    sudden_changes: list[dict]
    missed_patterns: list[dict]
    mood_changes: list[dict]
    needs_review: list[str]
    alert: dict | None


def _insights(patient_id: str) -> InsightsOut:
    ps = sim.get(patient_id)
    if ps is None:
        raise HTTPException(404, f"No patient {patient_id}")
    risk, history, now = ps.risk, list(ps.history), sim.now
    q = data_quality(history, now, risk)
    conf, reasons = confidence(risk, q)
    changes = sudden_changes(history, now, ps.info.get("spo2_scale", 1))
    with Session(engine) as s:
        meds = {m.id: m for m in s.exec(select(Medication).where(Medication.patient_id == patient_id)).all()}
        rows = s.exec(select(DoseEvent).where(DoseEvent.patient_id == patient_id, DoseEvent.scheduled_at <= now)).all()
        doses = []
        for d in rows:
            m = meds.get(d.medication_id)
            if m is None:
                continue
            doses.append((m.name, m.critical, d.scheduled_at, effective_status(Dose(m.name, d.scheduled_at, d.status), now)))
        checkins = s.exec(select(DailyCheckin).where(DailyCheckin.patient_id == patient_id, DailyCheckin.ts >= now - timedelta(days=14))).all()
    patterns = missed_patterns(doses, now)
    mood, mood_ch = mood_changes([(c.ts, c.mood, c.energy, c.sleep) for c in checkins])
    review = []
    review += [f"{c['label']} {'changed' if c['sudden'] else 'out of range'}: {c['from'] if c['from'] is not None else '—'} → {c['to']} {c['unit']}"
               for c in changes if c["severity"] == "High" or c["sudden"]]
    review += [p["text"] for p in patterns if p["kind"] in ("critical", "weekday", "streak")]
    review += [m["text"] for m in mood_ch]
    return InsightsOut(
        patient_id=patient_id, level=risk.level, score=risk.score, confidence=conf, confidence_reasons=reasons,
        data_quality=QualityOut(**q.__dict__), sudden_changes=changes, missed_patterns=patterns,
        mood=mood, mood_changes=mood_ch, needs_review=review,
    )


@router.get("/patients/{patient_id}/insights", response_model=InsightsOut,
            summary="Confidence, data quality, sudden changes, missed-dose patterns and mood for one patient")
async def patient_insights(patient_id: str):
    return await asyncio.to_thread(_insights, patient_id)


@router.get("/insights", response_model=list[QueueItem], summary="The ward's review queue, most urgent first")
async def ward_queue():
    def build() -> list[QueueItem]:
        with Session(engine) as s:
            open_alerts = {a.patient_id: a for a in s.exec(select(Alert).where(Alert.status != "resolved").order_by(col(Alert.created_at))).all()}
        items = []
        for pid, ps in sim.states.items():
            ins = _insights(pid)
            prio = PRIORITY.get(ins.level)
            if prio is None and (any(c["severity"] == "High" for c in ins.sudden_changes) or ins.needs_review):
                prio = "Moderate"  # stable by score, but something changed worth a look
            a = open_alerts.get(pid)
            items.append(QueueItem(
                patient_id=pid, name=ps.info["name"], bed=ps.info["bed"], ward=ps.info["ward"], priority=prio,
                level=ins.level, score=ins.score, news2=ps.risk.news2.total, confidence=ins.confidence,
                data_quality=ins.data_quality.label,
                factors=[{"headline": f.headline, "kind": f.kind, "factor": f.factor, "message": f.message, "contribution": f.contribution}
                         for f in ps.risk.factors if f.contribution > 0][:5],
                sudden_changes=ins.sudden_changes, missed_patterns=ins.missed_patterns, mood_changes=ins.mood_changes,
                needs_review=ins.needs_review,
                alert=None if a is None else {"id": a.id, "status": a.status, "level": a.level, "created_at": a.created_at.isoformat() + "Z",
                                             "acknowledged_by": a.acknowledged_by},
            ))
        return sorted(items, key=lambda i: (RANK[i.priority], -i.score))

    return await asyncio.to_thread(build)


# ---------------------------------------------------------------- notes and follow-ups


class NoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    kind: Literal["note", "followup"] = "note"
    visible: bool = True
    follow_up_on: str = Field("", max_length=10)  # "YYYY-MM-DD"
    author: str = Field("Doctor", max_length=80)


class NoteOut(BaseModel):
    id: int
    ts: UTC
    author: str
    kind: str
    text: str
    visible: bool
    follow_up_on: str


def _patient(s: Session, patient_id: str) -> Patient:
    p = s.get(Patient, patient_id)
    if p is None:
        raise HTTPException(404, f"No patient {patient_id}")
    return p


@router.get("/patients/{patient_id}/notes", response_model=list[NoteOut], summary="Doctor notes, newest first")
def list_notes(patient_id: str, visible_only: bool = False, s: Session = Depends(get_session)):
    _patient(s, patient_id)
    q = select(DoctorNote).where(DoctorNote.patient_id == patient_id)
    if visible_only:
        q = q.where(DoctorNote.visible == True)  # noqa: E712 (SQL expression)
    return [NoteOut(**n.model_dump()) for n in s.exec(q.order_by(col(DoctorNote.ts).desc())).all()]


@router.post("/patients/{patient_id}/notes", response_model=NoteOut, summary="Write a note or follow-up instruction")
def add_note(patient_id: str, body: NoteIn, s: Session = Depends(get_session)):
    _patient(s, patient_id)
    if body.follow_up_on:
        try:
            datetime.strptime(body.follow_up_on, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(422, "follow_up_on must be YYYY-MM-DD")
    n = DoctorNote(patient_id=patient_id, ts=sim.now, author=body.author.strip() or "Doctor", kind=body.kind, text=body.text.strip(),
                   visible=body.visible or body.kind == "followup", follow_up_on=body.follow_up_on)
    s.add(n)
    s.commit()
    s.refresh(n)
    return NoteOut(**n.model_dump())


# ---------------------------------------------------------------- appointments


class AppointmentIn(BaseModel):
    reason: str = Field("", max_length=500)
    preferred: str = Field("", max_length=120)
    mode: Literal["in_person", "video"] = "in_person"
    requested_by: Literal["patient", "doctor"] = "patient"


class AppointmentUpdate(BaseModel):
    status: Literal["requested", "confirmed", "declined", "done"] | None = None
    mode: Literal["in_person", "video"] | None = None
    scheduled_for: datetime | None = None


class AppointmentOut(BaseModel):
    id: int
    patient_id: str
    patient_name: str
    bed: str
    created_at: UTC
    requested_by: str
    reason: str
    preferred: str
    mode: str
    status: str
    scheduled_for: UTC | None
    video_url: str


def _appt_out(a: Appointment) -> AppointmentOut:
    info = sim.get(a.patient_id).info if sim.get(a.patient_id) else {"name": a.patient_id, "bed": ""}
    return AppointmentOut(**a.model_dump(exclude={"updated_at"}), patient_name=info["name"], bed=info["bed"])


@router.get("/patients/{patient_id}/appointments", response_model=list[AppointmentOut], summary="A patient's appointments, newest first")
def patient_appointments(patient_id: str, s: Session = Depends(get_session)):
    _patient(s, patient_id)
    rows = s.exec(select(Appointment).where(Appointment.patient_id == patient_id).order_by(col(Appointment.created_at).desc())).all()
    return [_appt_out(a) for a in rows]


@router.post("/patients/{patient_id}/appointments", response_model=AppointmentOut, summary="Request (patient) or book (doctor) an appointment")
def request_appointment(patient_id: str, body: AppointmentIn, s: Session = Depends(get_session)):
    _patient(s, patient_id)
    a = Appointment(patient_id=patient_id, created_at=sim.now, requested_by=body.requested_by, reason=body.reason.strip(),
                    preferred=body.preferred.strip(), mode=body.mode, status="requested" if body.requested_by == "patient" else "confirmed")
    if a.status == "confirmed" and a.mode == "video":
        a.video_url = f"https://meet.jit.si/AYU-{uuid.uuid4().hex[:12]}"
    s.add(a)
    s.commit()
    s.refresh(a)
    return _appt_out(a)


@router.get("/appointments", response_model=list[AppointmentOut], summary="Appointments across the ward (requests first)")
def list_appointments(status: Literal["all", "requested", "confirmed", "declined", "done"] = "all",
                      limit: int = Query(50, ge=1, le=200), s: Session = Depends(get_session)):
    q = select(Appointment)
    if status != "all":
        q = q.where(Appointment.status == status)
    rows = s.exec(q.order_by(col(Appointment.created_at).desc()).limit(limit)).all()
    return sorted((_appt_out(a) for a in rows), key=lambda x: x.status != "requested")


@router.post("/appointments/{appointment_id}", response_model=AppointmentOut, summary="Confirm, decline, reschedule or switch to video")
def update_appointment(appointment_id: int, body: AppointmentUpdate, s: Session = Depends(get_session)):
    a = s.get(Appointment, appointment_id)
    if a is None:
        raise HTTPException(404, f"No appointment {appointment_id}")
    if body.mode:
        a.mode = body.mode
    if body.status:
        a.status = body.status
    if body.scheduled_for:
        a.scheduled_for = body.scheduled_for.replace(tzinfo=None) if body.scheduled_for.tzinfo is None else \
            (body.scheduled_for - body.scheduled_for.utcoffset()).replace(tzinfo=None)
    if a.mode == "video" and a.status == "confirmed" and not a.video_url:
        # A private room on the public Jitsi service: no account or key; needs the internet on both ends.
        a.video_url = f"https://meet.jit.si/AYU-{uuid.uuid4().hex[:12]}"
    a.updated_at = sim.now
    s.add(a)
    s.commit()
    s.refresh(a)
    return _appt_out(a)
