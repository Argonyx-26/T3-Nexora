"""Adding a patient: read a report into a draft (PDF, photo or text), then create the patient
from the reviewed draft. AYU scores them at once and they appear on the ward.

A patient added this way is real: AYU never simulates their vitals. Their risk comes from the
readings in the report and any readings entered later (by staff, the patient or an ASHA worker).
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import re
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..db import engine
from ..intake.extract import RANGES, extract
from ..models import DoctorNote, Hospital, Medication, Patient, SymptomReport, VitalReading
from ..risk import weights as W
from ..services.hub import hub
from ..sim.simulator import sim
from .network import assign
from .patients import summary_of

router = APIRouter(tags=["Intake"])

MAX_BYTES = 8 * 1024 * 1024
ALLOWED = {"application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic", "text/plain"}
# Population normals, used until AYU has learned this patient's own (it needs a day of readings).
DEFAULT_NORMALS = {"hr": (76, 9), "spo2": (97, 1.3), "sbp": (122, 10), "dbp": (78, 7), "rr": (15, 2), "temp": (36.8, 0.3), "glucose": (115, 18)}


class ExtractIn(BaseModel):
    filename: str = Field("", max_length=200)
    mime: str = Field("", max_length=100)
    data_base64: str = ""  # the file, base64 (a data: URL prefix is fine)
    text: str = Field("", max_length=60_000)


class ExtractOut(BaseModel):
    draft: dict
    source: str  # "gemini" | "builtin"
    model: str | None
    found: list[str]
    message: str


@router.post("/intake/extract", response_model=ExtractOut, summary="Read a report (PDF, photo or text) into a patient draft")
async def extract_report(body: ExtractIn):
    data = None
    mime = body.mime.lower().strip()
    if body.data_base64:
        raw = body.data_base64.split(",", 1)[1] if body.data_base64.startswith("data:") else body.data_base64
        try:
            data = base64.b64decode(raw, validate=True)
        except (binascii.Error, ValueError):
            raise HTTPException(422, "The file could not be decoded")
        if len(data) > MAX_BYTES:
            raise HTTPException(413, "Reports up to 8 MB, please")
        if not mime and body.filename.lower().endswith(".pdf"):
            mime = "application/pdf"
        if mime not in ALLOWED:
            raise HTTPException(415, "Upload a PDF or a photo (PNG, JPG, WEBP)")
        if mime == "text/plain":
            body.text = data.decode("utf-8", "ignore") + "\n" + body.text
            data, mime = None, ""
    if data is None and not body.text.strip():
        raise HTTPException(422, "Upload a report or paste its text")
    return ExtractOut(**await extract(data, mime or None, body.text or None))


class MedIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    dose: str = Field("", max_length=30)
    purpose: str = Field("", max_length=60)
    times: list[str] = Field(default_factory=lambda: ["08:00"], max_length=6)
    critical: bool = False


class VitalsCore(BaseModel):
    hr: float
    spo2: float
    sbp: float
    dbp: float
    rr: float
    temp: float
    glucose: float | None = None
    on_oxygen: bool = False
    consciousness: Literal["A", "C", "V", "P", "U"] = "A"


class PatientIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    age: int = Field(ge=0, le=120)
    sex: Literal["M", "F"]
    ward: str = Field("Intake", max_length=40)
    bed: str = Field("", max_length=12)
    language: Literal["en", "hi"] = "en"
    spo2_scale: Literal[1, 2] = 1
    conditions: list[str] = Field(default_factory=list, max_length=15)
    medications: list[MedIn] = Field(default_factory=list, max_length=20)
    vitals: VitalsCore
    symptoms: list[str] = Field(default_factory=list, max_length=15)
    history: list[dict] = Field(default_factory=list, max_length=15)
    notes: str = Field("", max_length=600)
    report_name: str = Field("", max_length=200)
    source: Literal["pdf", "photo", "text", "manual", "self"] = "manual"
    hospital_id: str = Field("H01", max_length=10)
    consent: bool = False  # required when a patient registers themselves


@router.post("/patients", summary="Add a patient (from a reviewed report draft or by hand); AYU scores them at once")
async def create_patient(body: PatientIn):
    for k, (lo, hi) in RANGES.items():
        v = getattr(body.vitals, k)
        if v is not None and not lo <= v <= hi:
            raise HTTPException(422, f"{k} {v} is outside {lo}–{hi}")
    unknown = [k for k in body.symptoms if k not in W.SYMPTOMS]
    if unknown:
        raise HTTPException(422, f"Unknown symptoms: {unknown}")
    if body.source == "self" and not body.consent:
        raise HTTPException(422, "Please agree to share your readings with your care team")
    for m in body.medications:
        if any(not re.fullmatch(r"[0-2]\d:[0-5]\d", t) for t in m.times):
            raise HTTPException(422, f"Times for {m.name} must be HH:MM")

    def save() -> str:
        sim.ensure_loaded()
        with Session(engine) as s:
            if s.get(Hospital, body.hospital_id) is None:
                raise HTTPException(422, f"Unknown site {body.hospital_id}")
            ids = [p.id for p in s.exec(select(Patient)).all()]
            n = max((int(i[1:]) for i in ids if re.fullmatch(r"P\d+", i)), default=0) + 1
            pid = f"P{n:03d}"
            bed = body.bed.strip() or f"N-{n:02d}"
            normals = dict(DEFAULT_NORMALS)
            if body.spo2_scale == 2:
                normals["spo2"] = (90, 1.5)  # prescribed 88–92% target
            s.add(Patient(
                id=pid, name=body.name.strip(), age=body.age, sex=body.sex, conditions=body.conditions, ward=body.ward.strip() or "Intake",
                bed=bed, language=body.language, spo2_scale=body.spo2_scale,
                normals={k: {"mean": m, "std": sd} for k, (m, sd) in normals.items()},
                notes=body.notes.strip(), history=body.history, source="intake", hospital_id=body.hospital_id,
                registered_by="self" if body.source == "self" else "clinician",
            ))
            s.flush()
            v = body.vitals
            s.add(VitalReading(patient_id=pid, ts=sim.now, hr=v.hr, spo2=v.spo2, sbp=v.sbp, dbp=v.dbp, rr=v.rr, temp=v.temp,
                               glucose=v.glucose, on_oxygen=v.on_oxygen, consciousness=v.consciousness, source="report"))
            for m in body.medications:
                s.add(Medication(patient_id=pid, name=m.name.strip(), dose=m.dose.strip(), purpose=m.purpose.strip(),
                                 times=m.times, critical=m.critical))
            for k in dict.fromkeys(body.symptoms):
                s.add(SymptomReport(patient_id=pid, ts=sim.now, symptom=k, source="report", note="From the admission report"))
            how = {"pdf": "a PDF report", "photo": "a photo of a report", "text": "pasted report text", "manual": "manual entry",
                   "self": "the patient's own registration"}[body.source]
            checked = "entered by the patient — please verify at the first visit" if body.source == "self" else "reviewed by a clinician before saving"
            s.add(DoctorNote(patient_id=pid, ts=sim.now, author="AYU intake", kind="note", visible=False,
                             text=f"Added from {how}{f' ({body.report_name})' if body.report_name else ''}; {checked}."))
            s.commit()
        return pid

    pid = await asyncio.to_thread(save)
    message = await asyncio.to_thread(sim.add_patient, pid)
    await hub.broadcast(message)

    def assign_now() -> None:  # with their risk known, AYU picks the doctor
        with Session(engine) as s:
            assign(s, s.get(Patient, pid))
            s.commit()

    await asyncio.to_thread(assign_now)
    summary = summary_of(pid)
    return {"patient": summary.model_dump(mode="json"), "patient_id": pid}
