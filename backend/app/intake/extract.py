"""Read a patient report into a structured draft.

- With a Gemini key, the PDF or photo itself goes to Gemini with a strict JSON schema
  (it reads handwriting, tables and scans). Only the report is sent — nothing else AYU holds.
- Without one (or if Gemini fails), AYU reads the text of a PDF, or pasted text, with its
  own rules: vitals, conditions, medicines with their frequency, symptoms and history.
  A photo needs Gemini; offline, AYU says so and the clinician types the values in.

Either way the result is only a draft: every value is range-checked, nothing is invented,
and a clinician reviews it before the patient is added.
"""

from __future__ import annotations

import asyncio
import io
import json
import logging
import re
import time

from ..config import settings
from ..risk import weights as W

log = logging.getLogger("ayu.intake")

EXTRACT_TIMEOUT_S = 25.0
MAX_TEXT = 60_000

RANGES = {"hr": (20, 250), "spo2": (50, 100), "sbp": (50, 260), "dbp": (30, 160), "rr": (4, 60), "temp": (30, 43), "glucose": (20, 800)}

CONDITIONS = [
    (r"type\s*1\s*(?:diabetes|dm)|\bt1dm\b|iddm", "Type 1 diabetes"),
    (r"type\s*2\s*(?:diabetes|dm)|\bt2dm\b|niddm", "Type 2 diabetes"),
    (r"(?<!type 1 )(?<!type 2 )\bdiabet(?:es|ic)\b|\bdm\b", "Diabetes"),
    (r"hypertension|\bhtn\b|high blood pressure", "Hypertension"),
    (r"\basthma", "Asthma"),
    (r"\bcopd\b|chronic obstructive", "COPD"),
    (r"heart failure|\bhfref\b|\bhfpef\b|\bccf\b|\bchf\b", "Heart failure"),
    (r"atrial fibrillation|\baf\b|\bafib\b", "Atrial fibrillation"),
    (r"chronic kidney|\bckd\b", "Chronic kidney disease"),
    (r"hypothyroid", "Hypothyroidism"),
    (r"an(?:a)?emia", "Anaemia"),
    (r"pneumonia", "Pneumonia"),
    (r"\bsepsis\b|septic", "Sepsis"),
    (r"dengue", "Dengue"),
    (r"covid|sars-cov-2", "COVID-19"),
    (r"myocardial infarction|\bstemi\b|\bnstemi\b|heart attack|post-mi", "Previous heart attack (MI)"),
    (r"coronary artery disease|\bcad\b|\bihd\b", "Coronary artery disease"),
    (r"\bstroke\b|\bcva\b", "Previous stroke"),
    (r"tuberculosis|\btb\b", "Tuberculosis"),
    (r"epilep|seizure disorder", "Epilepsy"),
    (r"appendicectomy|appendectomy", "Post-op (appendectomy)"),
]

SYMPTOMS = [
    (r"chest pain|chest tightness", "chest_pain"),
    (r"breathless|shortness of breath|\bsob\b|dyspn(?:o)?ea", "breathlessness"),
    (r"fever with chills|chills|rigor", "fever_chills"),
    (r"\bcough", "cough"),
    (r"severe headache", "severe_headache"),
    (r"dizz|giddiness|vertigo", "dizziness"),
    (r"vomit", "vomiting"),
    (r"fatigue|tiredness|weakness(?! on)", "fatigue"),
    (r"palpitation", "palpitations"),
    (r"(?:leg|pedal|ankle) (?:swelling|oedema|edema)|swelling (?:of|in) (?:the )?legs", "leg_swelling"),
    (r"confus|disorient", "confusion"),
    (r"faint|syncope", "fainting"),
    (r"blurred vision", "blurred_vision"),
    (r"coughing blood|haemoptysis|hemoptysis", "coughing_blood"),
    (r"less urine|reduced urine|oliguria", "reduced_urine"),
    (r"excessive thirst|polydipsia", "excessive_thirst"),
]

FREQUENCY = [
    (r"\bqid\b|four times|1-1-1-1", ["06:00", "12:00", "18:00", "22:00"]),
    (r"\btds\b|\btid\b|thrice|three times|1-1-1", ["08:00", "14:00", "20:00"]),
    (r"\bbd\b|\bbid\b|twice|two times|1-0-1", ["08:00", "20:00"]),
    (r"\bhs\b|at night|bedtime|0-0-1", ["22:00"]),
    (r"\bod\b|once daily|once a day|daily|1-0-0", ["08:00"]),
]
CRITICAL_MEDS = re.compile(
    r"insulin|warfarin|apixaban|rivaroxaban|dabigatran|heparin|enoxaparin|clopidogrel|ticagrelor|aspirin|"
    r"metoprolol|bisoprolol|carvedilol|digoxin|levetiracetam|phenytoin|valproate|prednisolone|hydrocortisone|"
    r"ceftriaxone|piperacillin|meropenem|amlodipine|tiotropium",
    re.I,
)
MED_LINE = re.compile(
    r"(?:^|\b)(?:tab\.?|cap\.?|inj\.?|syp\.?|tablet|capsule|injection|inhaler)?\s*"
    r"([A-Z][A-Za-z\-]{2,}(?:\s[A-Z][A-Za-z\-]{2,})?)\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|µg|g|units?|iu|ml|puffs?))\b(.*)$",
    re.I,
)
NOT_MEDS = re.compile(r"^(?:glucose|sugar|blood|hb|haemoglobin|hemoglobin|creatinine|sodium|potassium|bp|pulse|temp|rbs|fbs|urea)$", re.I)


def _num(v) -> float | None:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f else None


def clean_draft(d: dict) -> dict:
    """Range-check and normalise any draft (from Gemini or the rules); drop what doesn't fit."""
    out: dict = {"name": "", "age": None, "sex": "", "conditions": [], "medications": [], "vitals": {},
                 "symptoms": [], "history": [], "notes": ""}
    name = str(d.get("name") or "").strip()
    out["name"] = re.sub(r"\s+", " ", name)[:80]
    age = _num(d.get("age"))
    out["age"] = int(age) if age is not None and 0 <= age <= 120 else None
    sex = str(d.get("sex") or "").strip().upper()[:1]
    out["sex"] = sex if sex in ("M", "F") else ""
    seen = set()
    for c in d.get("conditions") or []:
        c = str(c).strip()[:80]
        if c and c.lower() not in seen:
            seen.add(c.lower())
            out["conditions"].append(c)
    for m in (d.get("medications") or [])[:20]:
        if not isinstance(m, dict) or not str(m.get("name") or "").strip():
            continue
        times = [t for t in (m.get("times") or []) if isinstance(t, str) and re.fullmatch(r"[0-2]\d:[0-5]\d", t)]
        mname = str(m["name"]).strip()[:60]
        out["medications"].append({
            "name": mname, "dose": str(m.get("dose") or "").strip()[:30], "purpose": str(m.get("purpose") or "").strip()[:60],
            "times": times or ["08:00"], "critical": bool(m.get("critical")) or bool(CRITICAL_MEDS.search(mname)),
        })
    vit = d.get("vitals") or {}
    for k, (lo, hi) in RANGES.items():
        v = _num(vit.get(k))
        if k == "temp" and v is not None and v > 45:
            v = round((v - 32) * 5 / 9, 1)  # °F → °C
        if v is not None and lo <= v <= hi:
            out["vitals"][k] = round(v, 1) if k == "temp" else round(v)
    out["symptoms"] = [s for s in dict.fromkeys(d.get("symptoms") or []) if s in W.SYMPTOMS]
    for h in (d.get("history") or [])[:15]:
        if isinstance(h, dict) and str(h.get("event") or "").strip():
            out["history"].append({"year": str(h.get("year") or "").strip()[:10], "event": str(h["event"]).strip()[:140]})
    out["notes"] = str(d.get("notes") or "").strip()[:600]
    return out


# ---------------------------------------------------------------- the built-in reader

def _first(pattern: str, text: str, flags=re.I):
    m = re.search(pattern, text, flags)
    return m.groups() if m else None


def parse_text(text: str) -> dict:
    """AYU's own reader for report text: labelled vitals, known conditions, medicine lines, symptoms."""
    t = text.replace("°", "°")
    low = t.lower()
    d: dict = {"vitals": {}, "conditions": [], "medications": [], "symptoms": [], "history": []}

    if g := _first(r"(?:patient(?:'s)?\s*name|name\s+of\s+patient|\bname)\s*[:\-]\s*(?:mr\.?|mrs\.?|ms\.?|shri|smt\.?)?\s*([A-Za-z][A-Za-z .]{1,60}?)(?=\s{2,}|\s*(?:age|sex|gender|uhid|ip|mrn|\d)|$)", t, re.I | re.M):
        d["name"] = g[0].strip().title()
    if g := _first(r"\bage\s*[:/\-]?\s*(\d{1,3})", t) or _first(r"\b(\d{1,3})\s*(?:y|yr|yrs|years)\b", t):
        d["age"] = g[0]
    if g := _first(r"(?:sex|gender)\s*[:/\-]?\s*(male|female|m|f)\b", t) or _first(r"\d{1,3}\s*(?:y|yrs|years)?\s*/\s*(m|f)\b", t):
        d["sex"] = g[0][0].upper()

    if g := _first(r"(?:\bbp\b|blood pressure)\s*[:\-]?\s*(\d{2,3})\s*/\s*(\d{2,3})", t):
        d["vitals"]["sbp"], d["vitals"]["dbp"] = g
    if g := _first(r"(?:pulse(?: rate)?|heart rate|\bhr\b|\bpr\b)\s*[:\-]?\s*(\d{2,3})", t):
        d["vitals"]["hr"] = g[0]
    if g := _first(r"(?:spo\s*2|spo₂|oxygen saturation|o2 sat(?:uration)?|\bsats?\b)\s*[:\-]?\s*(\d{2,3})", t):
        d["vitals"]["spo2"] = g[0]
    if g := _first(r"(?:resp(?:iratory)?\.?\s*rate|\brr\b|respiration)\s*[:\-]?\s*(\d{1,2})", t):
        d["vitals"]["rr"] = g[0]
    if g := _first(r"(?:temp(?:erature)?)\s*[:\-]?\s*(\d{2,3}(?:\.\d+)?)\s*°?\s*([cf])?", t):
        v = float(g[0])
        if (g[1] or "").lower() == "f" or v > 45:
            v = (v - 32) * 5 / 9
        d["vitals"]["temp"] = round(v, 1)
    if g := _first(r"(?:glucose|blood sugar|\brbs\b|\bfbs\b|\bgrbs\b|sugar)\s*(?:\(\w+\))?\s*[:\-]?\s*(\d{2,3})", t):
        d["vitals"]["glucose"] = g[0]
    if re.search(r"on oxygen|o2 via|nasal cannula|\bnrbm\b|\d\s*l/min", low):
        d["on_oxygen"] = True

    for pattern, label in CONDITIONS:
        if re.search(pattern, low):
            if label == "Diabetes" and any(c.endswith("diabetes") for c in d["conditions"]):
                continue
            d["conditions"].append(label)
    for pattern, key in SYMPTOMS:
        if re.search(pattern, low) and not re.search(r"\b(?:no|denies|without)\s+(?:\w+\s){0,2}(?:" + pattern + ")", low):
            d["symptoms"].append(key)

    for line in t.splitlines():
        line = line.strip(" -•*\t")
        m = MED_LINE.search(line)
        if not m or NOT_MEDS.match(m.group(1)):
            continue
        rest = (m.group(3) or "").lower() + " " + line.lower()
        times = next((ts for pat, ts in FREQUENCY if re.search(pat, rest)), ["08:00"])
        purpose = ""
        if pm := re.search(r"(?:for|—|-)\s+([a-z][a-z ]{2,40})$", (m.group(3) or "").strip(), re.I):
            purpose = pm.group(1).strip().capitalize()
        d["medications"].append({"name": m.group(1).strip().title(), "dose": re.sub(r"\s+", " ", m.group(2)), "times": times, "purpose": purpose})

    for m in re.finditer(r"^\s*((?:19|20)\d{2})\s*[:\-–]\s*(.{4,120})$", t, re.M):
        d["history"].append({"year": m.group(1), "event": m.group(2).strip()})
    if g := _first(r"(?:impression|diagnosis|assessment|summary)\s*[:\-]\s*(.{5,300})", t):
        d["notes"] = g[0].strip()
    return d


def pdf_text(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    return "\n".join((page.extract_text() or "") for page in reader.pages[:10])[:MAX_TEXT]


# ---------------------------------------------------------------- Gemini

PROMPT = """You are reading a patient's medical report for a hospital early-warning system.
Extract ONLY what is written. Never guess or invent values; use null / [] when absent.
Return JSON with exactly these keys:
{"name": str|null, "age": int|null, "sex": "M"|"F"|null,
 "conditions": [str],
 "medications": [{"name": str, "dose": str, "purpose": str, "times": ["HH:MM"], "critical": bool}],
 "vitals": {"hr": num|null, "spo2": num|null, "sbp": num|null, "dbp": num|null, "rr": num|null, "temp_c": num|null, "glucose_mg_dl": num|null},
 "symptoms": [one of SYMPTOM_KEYS],
 "history": [{"year": str, "event": str}],
 "notes": "one or two sentences: the report's diagnosis / impression, in plain words"}
Frequencies: OD → ["08:00"], BD → ["08:00","20:00"], TDS → ["08:00","14:00","20:00"], QID → ["06:00","12:00","18:00","22:00"], HS/night → ["22:00"].
critical = true for insulin, anticoagulants, antiplatelets, rate/rhythm drugs, anti-epileptics, IV antibiotics, steroids.
Use the most recent set of vitals if there are several."""

_client = None
_skip_until = 0.0


def _gemini_extract(data: bytes | None, mime: str | None, text: str | None) -> dict:
    from google import genai
    from google.genai import types

    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.gemini_api_key,
                               http_options=types.HttpOptions(timeout=int(EXTRACT_TIMEOUT_S * 1000)))
    prompt = PROMPT.replace("SYMPTOM_KEYS", ", ".join(sorted(W.SYMPTOMS)))
    contents: list = [prompt]
    if data is not None:
        contents.append(types.Part.from_bytes(data=data, mime_type=mime or "application/octet-stream"))
    if text:
        contents.append(text[:MAX_TEXT])
    reply = _client.models.generate_content(
        model=settings.gemini_model, contents=contents,
        config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.0, max_output_tokens=2000,
                                           thinking_config=types.ThinkingConfig(thinking_budget=0)),
    )
    raw = json.loads(reply.text or "{}")
    vit = raw.get("vitals") or {}
    raw["vitals"] = {"hr": vit.get("hr"), "spo2": vit.get("spo2"), "sbp": vit.get("sbp"), "dbp": vit.get("dbp"),
                     "rr": vit.get("rr"), "temp": vit.get("temp_c"), "glucose": vit.get("glucose_mg_dl")}
    return raw


async def extract(data: bytes | None, mime: str | None, text: str | None) -> dict:
    """→ {"draft": {...}, "source": "gemini" | "builtin", "found": [...], "message": str}"""
    global _skip_until
    is_pdf = bool(mime and "pdf" in mime)
    is_image = bool(mime and mime.startswith("image/"))
    if settings.gemini_api_key and time.monotonic() >= _skip_until:
        try:
            raw = await asyncio.wait_for(asyncio.to_thread(_gemini_extract, data, mime, text), timeout=EXTRACT_TIMEOUT_S)
            draft = clean_draft(raw)
            return {"draft": draft, "source": "gemini", "model": settings.gemini_model, "found": _found(draft),
                    "message": "Read by Gemini. Check every value before adding the patient."}
        except Exception as e:  # network, quota, bad file: fall back to the built-in reader
            log.warning("gemini extraction failed (%s); using the built-in reader", type(e).__name__)
            _skip_until = time.monotonic() + 60

    body = text or ""
    if is_pdf and data is not None:
        try:
            body = (await asyncio.to_thread(pdf_text, data)) + "\n" + body
        except Exception as e:
            log.warning("could not read the PDF (%s)", type(e).__name__)
    if not body.strip():
        msg = ("Reading a photo needs Gemini (a key and the internet). Fill in the values from the report below."
               if is_image else "No text could be read from this file (a scanned PDF needs Gemini). Fill in the values below.")
        return {"draft": clean_draft({}), "source": "builtin", "model": None, "found": [], "message": msg}
    draft = clean_draft(parse_text(body))
    return {"draft": draft, "source": "builtin", "model": None, "found": _found(draft),
            "message": "Read by AYU's built-in reader (offline). Check every value before adding the patient."}


def _found(d: dict) -> list[str]:
    f = [k for k in ("name", "age", "sex", "notes") if d.get(k)]
    f += [f"vitals.{k}" for k in d["vitals"]]
    if d["conditions"]:
        f.append("conditions")
    if d["medications"]:
        f.append("medications")
    if d["symptoms"]:
        f.append("symptoms")
    if d["history"]:
        f.append("history")
    return f
