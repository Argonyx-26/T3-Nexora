"""The AYU network: hospitals and PHCs, their doctors, and who looks after whom.

One AYU deployment serves many sites. Every patient belongs to one site and is assigned to a
doctor there by a transparent rule (services/assign.py); doctors can override it, and when a
doctor goes off duty their patients are handed over by the same rule.
"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import engine
from ..models import Doctor, DoctorNote, Hospital, Patient
from ..services.assign import SICK, DoctorLoad, pick_doctor
from ..services.hub import hub
from ..sim.simulator import sim

router = APIRouter(tags=["Network"])


def _level(pid: str) -> str:
    ps = sim.get(pid)
    return ps.risk.level if ps and ps.risk else "Stable"


def _loads(s: Session, hospital_id: str, exclude: str | None = None) -> list[DoctorLoad]:
    docs = s.exec(select(Doctor).where(Doctor.hospital_id == hospital_id)).all()
    pts = s.exec(select(Patient).where(Patient.hospital_id == hospital_id)).all()
    by_doc: dict[str, list[str]] = {d.id: [] for d in docs}
    for p in pts:
        if p.doctor_id in by_doc and p.id != exclude:
            by_doc[p.doctor_id].append(_level(p.id))
    return [DoctorLoad(d.id, d.name, d.specialty, d.on_duty, d.max_patients, by_doc[d.id]) for d in docs]


def assign(s: Session, p: Patient, doctor_id: str | None = None, by: str = "AYU") -> tuple[str, str]:
    """Assign one patient (auto when doctor_id is None). Writes the patient and a care-team note; returns (doctor_id, reason)."""
    if doctor_id:
        d = s.get(Doctor, doctor_id)
        if d is None or d.hospital_id != p.hospital_id:
            raise HTTPException(422, "That doctor doesn't work at this patient's site")
        reason = f"Chosen by {by}"
    else:
        doc, reason = pick_doctor(p.conditions, _level(p.id), _loads(s, p.hospital_id, exclude=p.id))
        doctor_id = doc.id if doc else ""
    old = p.doctor_id
    p.doctor_id, p.assigned_reason = doctor_id, reason
    s.add(p)
    if old != doctor_id:
        name = s.get(Doctor, doctor_id).name if doctor_id else "nobody yet"
        s.add(DoctorNote(patient_id=p.id, ts=sim.now, author="AYU", kind="note", visible=True,
                         text=f"Your doctor is now {name}." if doctor_id else "Waiting for a doctor to be assigned."))
    ps = sim.get(p.id)
    if ps:  # keep the live ward in step
        ps.info.update(doctor_id=doctor_id, assigned_reason=reason, hospital_id=p.hospital_id)
    return doctor_id, reason


class HospitalOut(BaseModel):
    id: str
    name: str
    city: str
    kind: str
    patients: int
    high_risk: int
    unassigned: int
    doctors: int
    on_duty: int


class DoctorOut(BaseModel):
    id: str
    name: str
    specialty: str
    hospital_id: str
    on_duty: bool
    max_patients: int
    patients: list[str]
    high_risk: int
    load: int  # acuity-weighted


@router.get("/hospitals", response_model=list[HospitalOut], summary="Sites on the network, with their load")
def hospitals():
    with Session(engine) as s:
        out = []
        for h in s.exec(select(Hospital)).all():
            pts = s.exec(select(Patient).where(Patient.hospital_id == h.id)).all()
            docs = s.exec(select(Doctor).where(Doctor.hospital_id == h.id)).all()
            out.append(HospitalOut(
                id=h.id, name=h.name, city=h.city, kind=h.kind, patients=len(pts),
                high_risk=sum(1 for p in pts if _level(p.id) in SICK), unassigned=sum(1 for p in pts if not p.doctor_id),
                doctors=len(docs), on_duty=sum(1 for d in docs if d.on_duty),
            ))
        return out


@router.get("/doctors", response_model=list[DoctorOut], summary="Doctors (optionally at one site), with their patients and load")
def doctors(hospital_id: str | None = None):
    with Session(engine) as s:
        q = select(Doctor)
        if hospital_id:
            q = q.where(Doctor.hospital_id == hospital_id)
        out = []
        for d in s.exec(q).all():
            pts = [p.id for p in s.exec(select(Patient).where(Patient.doctor_id == d.id)).all()]
            levels = [_level(x) for x in pts]
            out.append(DoctorOut(id=d.id, name=d.name, specialty=d.specialty, hospital_id=d.hospital_id, on_duty=d.on_duty,
                                 max_patients=d.max_patients, patients=pts, high_risk=sum(1 for lv in levels if lv in SICK),
                                 load=sum({"Critical": 4, "Warning": 3, "Watch": 2}.get(lv, 1) for lv in levels)))
        return out


class AssignIn(BaseModel):
    doctor_id: str | None = None  # None = let AYU choose
    by: str = "Doctor"


@router.post("/patients/{patient_id}/assign", summary="Assign a patient to a doctor (or let AYU choose)")
async def assign_patient(patient_id: str, body: AssignIn):
    def run():
        with Session(engine) as s:
            p = s.get(Patient, patient_id)
            if p is None:
                raise HTTPException(404, f"No patient {patient_id}")
            doc, reason = assign(s, p, body.doctor_id, by=body.by)
            s.commit()
            return {"patient_id": patient_id, "doctor_id": doc, "reason": reason}

    out = await asyncio.to_thread(run)
    await hub.broadcast(sim.reassess(patient_id))
    return out


class DutyIn(BaseModel):
    on_duty: bool


@router.post("/doctors/{doctor_id}/duty", summary="Put a doctor on or off duty; their patients are handed over when they go off")
async def set_duty(doctor_id: str, body: DutyIn):
    def run():
        with Session(engine) as s:
            d = s.get(Doctor, doctor_id)
            if d is None:
                raise HTTPException(404, f"No doctor {doctor_id}")
            d.on_duty = body.on_duty
            s.add(d)
            s.flush()
            moves = []
            if not body.on_duty:
                # hand over the sickest first, so they get the best-placed doctor
                pts = sorted(s.exec(select(Patient).where(Patient.doctor_id == doctor_id)).all(),
                             key=lambda p: -{"Critical": 4, "Warning": 3, "Watch": 2}.get(_level(p.id), 1))
                for p in pts:
                    p.doctor_id = ""
                    s.add(p)
                s.flush()
                for p in pts:
                    new, reason = assign(s, p)
                    moves.append({"patient_id": p.id, "name": p.name, "doctor_id": new, "reason": reason})
                    s.flush()
            s.commit()
            return {"doctor_id": doctor_id, "on_duty": body.on_duty, "handed_over": moves}

    out = await asyncio.to_thread(run)
    for m in out["handed_over"]:
        await hub.broadcast(sim.reassess(m["patient_id"]))
    return out
