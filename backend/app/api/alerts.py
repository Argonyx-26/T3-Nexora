"""Alerts raised when a patient's level rises: new → acknowledged → resolved."""

from __future__ import annotations

import asyncio
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, col, select

from ..db import get_session
from ..models import Alert, DoseEvent
from ..schemas import AlertOut, DoseIn, NoteIn, RiskOut
from ..services.hub import hub
from ..services.serialize import risk_out
from ..sim.simulator import alert_out, sim

router = APIRouter(tags=["Alerts & care"])


def _info(patient_id: str) -> dict:
    ps = sim.get(patient_id)
    return ps.info if ps else {"name": patient_id, "bed": ""}


@router.get("/alerts", response_model=list[AlertOut], summary="Alerts, newest first")
def list_alerts(
    status: Literal["open", "all", "new", "acknowledged", "resolved"] = Query("open", description="open = new or acknowledged"),
    patient_id: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    s: Session = Depends(get_session),
):
    q = select(Alert)
    if status == "open":
        q = q.where(Alert.status != "resolved")
    elif status != "all":
        q = q.where(Alert.status == status)
    if patient_id:
        q = q.where(Alert.patient_id == patient_id)
    rows = s.exec(q.order_by(col(Alert.created_at).desc()).limit(limit)).all()
    return [alert_out(a, _info(a.patient_id)) for a in rows]


def _get(s: Session, alert_id: int) -> Alert:
    a = s.get(Alert, alert_id)
    if a is None:
        raise HTTPException(404, f"No alert {alert_id}")
    return a


@router.post("/alerts/{alert_id}/ack", response_model=AlertOut, summary="Acknowledge an alert, with the doctor's note")
async def acknowledge(alert_id: int, body: NoteIn, s: Session = Depends(get_session)):
    a = _get(s, alert_id)
    if a.status == "resolved":
        raise HTTPException(409, "Alert is already resolved")
    a.status, a.acknowledged_at = "acknowledged", sim.now
    a.acknowledged_by = body.by[:80]
    if body.note:
        a.note = body.note[:1000]
    s.add(a)
    s.commit()
    s.refresh(a)
    await hub.broadcast(sim.alert_changed(a))
    return alert_out(a, _info(a.patient_id))


@router.post("/alerts/{alert_id}/resolve", response_model=AlertOut, summary="Resolve an alert, with an optional note")
async def resolve(alert_id: int, body: NoteIn, s: Session = Depends(get_session)):
    a = _get(s, alert_id)
    if a.status != "resolved":
        a.status, a.resolved_at = "resolved", sim.now
        if a.acknowledged_at is None:
            a.acknowledged_at, a.acknowledged_by = sim.now, body.by[:80]
        if body.note:
            a.note = (a.note + "\n" if a.note else "") + body.note[:1000]
        s.add(a)
        s.commit()
        s.refresh(a)
    await hub.broadcast(sim.alert_changed(a))
    return alert_out(a, _info(a.patient_id))


@router.post("/doses", response_model=RiskOut, summary="Mark a scheduled dose taken or missed; the patient is re-scored")
async def record_dose(body: DoseIn, s: Session = Depends(get_session)):
    if body.status not in ("taken", "missed"):
        raise HTTPException(422, "status must be taken or missed")
    dose = s.get(DoseEvent, body.dose_id)
    if dose is None:
        raise HTTPException(404, f"No dose {body.dose_id}")
    message = await asyncio.to_thread(sim.record_dose, body.dose_id, body.status)
    if message is None:
        raise HTTPException(409, "That dose is outside the live window")
    await hub.broadcast(message)
    return risk_out(dose.patient_id, sim.get(dose.patient_id).risk)
