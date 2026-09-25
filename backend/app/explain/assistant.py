"""AYU's patient-facing health assistant: answers questions about the patient's own
recorded readings, medicines and symptoms in plain English or Hindi.

Safety comes first and does not depend on the model:
- Red-flag words ("chest pain", "can't breathe", "सीने में दर्द", ...) get a fixed, urgent
  reply telling the patient to call a nurse or 108 now — before any model is asked.
- It informs, it never diagnoses or changes treatment: the model is told so, and every
  reply carries the disclaimer.
- The model sees only health facts (conditions, readings, medicines, symptoms, the risk
  picture) — never the patient's name, ID, bed or age.
- Gemini gets a hard timeout; after a failure it is skipped for a minute, and the
  built-in answers (keyword intents over the same facts) take over. The demo never waits.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass, field

from ..config import settings

log = logging.getLogger("ayu.assistant")

MAX_REPLY = 900
COOLDOWN_AFTER_FAILURE_S = 60
DEVANAGARI = re.compile(r"[ऀ-ॿ]")

RED_FLAGS = (
    "chest pain", "chest hurts", "heart attack", "can't breathe", "cant breathe", "cannot breathe", "not able to breathe",
    "breathless", "short of breath", "choking", "faint", "fainted", "unconscious", "passed out", "collapse",
    "stroke", "one side", "slurred", "seizure", "coughing blood", "vomiting blood", "bleeding heavily",
    "suicide", "kill myself", "saans nahi", "sans nahi", "seene me dard", "seene mein dard", "chhati me dard", "behosh",
    "सीने में दर्द", "छाती में दर्द", "सांस नहीं", "साँस नहीं", "सांस फूल", "बेहोश", "खून की उल्टी", "खांसी में खून", "लकवा",
)

URGENT = {
    "en": "This could be serious. Please tell a nurse right now, or call 108 for an ambulance. Don't wait for the app.",
    "hi": "यह गंभीर हो सकता है। कृपया अभी नर्स को बताएं, या एम्बुलेंस के लिए 108 पर कॉल करें। ऐप के भरोसे इंतज़ार न करें।",
}

SYSTEM_PROMPT = """You are AYU's health assistant, talking with a patient about their OWN recorded health data.
You receive a JSON summary of their conditions, latest readings (with their personal normal), medicines, doses,
symptoms and AYU's current risk picture, then the conversation so far and their question.

Rules:
- Explain in simple, warm language, in at most 4 short sentences. Answer in LANGUAGE.
- Use only the facts provided. Never invent readings, doses or numbers.
- You are not a doctor. Never diagnose, never name a disease as the cause, never tell them to start, stop or
  change a medicine or its dose. For anything like that, say their doctor or nurse should decide.
- If anything sounds urgent, or AYU's level is Warning or Critical, tell them to speak to a nurse now.
- Reply with plain text only."""

LANGUAGE = {"en": "English", "hi": "Hindi, in Devanagari script (keep numbers and units as they are)"}


@dataclass
class HealthFacts:
    """Everything the assistant may use. No identifiers: this is the privacy boundary."""

    level: str
    score: int
    urgency: str
    factors: list[str]
    conditions: list[str]
    readings: dict[str, dict]  # vital → {"value", "unit", "normal"}
    medicines: list[dict]  # {"name", "dose", "purpose", "times", "critical"}
    next_dose: dict | None
    adherence_pct: float | None
    symptoms: list[str]
    history: list[dict] = field(default_factory=list)  # [{"role": "user"|"assistant", "text": ...}]

    def payload(self) -> dict:
        return {k: v for k, v in self.__dict__.items() if k != "history"}


def is_red_flag(message: str) -> bool:
    text = message.lower()
    return any(flag in text for flag in RED_FLAGS)


# ---------------------------------------------------------------- built-in answers

INTENTS = {
    "meds": ("medicine", "medication", "tablet", "dose", "pill", "inhaler", "insulin", "dawa", "dawai", "goli",
             "दवा", "दवाई", "गोली", "इंसुलिन"),
    "vitals": ("bp", "pressure", "heart", "pulse", "hr", "oxygen", "spo2", "sugar", "glucose", "temp", "fever",
               "reading", "धड़कन", "ऑक्सीजन", "शुगर", "बुखार", "प्रेशर", "तापमान", "रीडिंग"),
    "status": ("how am i", "status", "score", "risk", "summary", "report", "kaisa", "kaise", "theek", "halat",
               "ठीक", "हालत", "कैसा", "कैसी", "स्थिति", "रिपोर्ट"),
    "symptoms": ("symptom", "feel", "pain", "tired", "dizzy", "cough", "dard", "लक्षण", "दर्द", "थकान", "चक्कर", "खांसी"),
    "hello": ("hello", "hi", "hey", "namaste", "नमस्ते", "नमस्कार"),
}

LEVEL_WORDS = {
    "en": {"Stable": "within your usual range", "Watch": "being watched a little more closely",
           "Warning": "changing — a doctor should see you within the hour", "Critical": "needing attention now"},
    "hi": {"Stable": "आपकी सामान्य सीमा में", "Watch": "थोड़ी ज़्यादा निगरानी में",
           "Warning": "बदल रही है — एक घंटे के भीतर डॉक्टर को देखना चाहिए", "Critical": "तुरंत ध्यान देने लायक"},
}

VITAL_NAMES = {
    "en": {"hr": "heart rate", "spo2": "oxygen", "bp": "blood pressure", "temp": "temperature", "glucose": "blood sugar"},
    "hi": {"hr": "धड़कन", "spo2": "ऑक्सीजन", "bp": "ब्लड प्रेशर", "temp": "तापमान", "glucose": "ब्लड शुगर"},
}


def _matches(message: str) -> list[str]:
    text = f" {message.lower()} "
    found = []
    for intent, words in INTENTS.items():
        for w in words:
            # short latin words must match as whole words ("hr", "bp", "hi"); others as substrings
            if (len(w) <= 3 and w.isascii() and re.search(rf"\b{re.escape(w)}\b", text)) or (not (len(w) <= 3 and w.isascii()) and w in text):
                found.append(intent)
                break
    return found


def builtin_reply(f: HealthFacts, message: str, lang: str) -> str:
    hi = lang == "hi"
    intents = _matches(message) or ["help"]
    parts: list[str] = []
    if "hello" in intents and len(intents) == 1:
        intents = ["hello", "status"]
    for intent in intents:
        if intent == "hello":
            parts.append("नमस्ते! मैं AYU हूँ।" if hi else "Namaste! I'm AYU's assistant.")
        elif intent == "status":
            words = LEVEL_WORDS["hi" if hi else "en"][f.level]
            if hi:
                parts.append(f"अभी आपकी रीडिंग {words} है (AYU स्कोर {f.score}/100).")
            else:
                parts.append(f"Right now your readings are {words} (AYU score {f.score}/100).")
            if f.factors:
                lead = "मुख्य कारण: " if hi else "What AYU is noticing: "
                parts.append(lead + "; ".join(f.factors[:2]) + ".")
        elif intent == "vitals":
            names = VITAL_NAMES["hi" if hi else "en"]
            bits = []
            for key in ("hr", "spo2", "bp", "temp", "glucose"):
                r = f.readings.get(key)
                if not r:
                    continue
                normal = f" ({'आपका सामान्य' if hi else 'your usual'} {r['normal']})" if r.get("normal") else ""
                bits.append(f"{names[key]} {r['value']} {r['unit']}{normal}")
            if bits:
                parts.append(("आपकी ताज़ा रीडिंग: " if hi else "Your latest readings: ") + ", ".join(bits) + ".")
        elif intent == "meds":
            if f.medicines:
                listed = ", ".join(f"{m['name']} {m['dose']} ({' & '.join(m['times'])})" for m in f.medicines)
                parts.append(("आपकी दवाइयाँ: " if hi else "Your medicines: ") + listed + ".")
                if f.next_dose:
                    nd = f.next_dose
                    parts.append(f"अगली खुराक: {nd['name']} {nd['time']} बजे।" if hi else f"Next dose: {nd['name']} at {nd['time']}.")
                if any(m["critical"] for m in f.medicines):
                    parts.append("ज़रूरी दवाइयाँ न छोड़ें।" if hi else "Please don't skip the ones marked important.")
                if f.adherence_pct is not None:
                    parts.append(f"पिछले 7 दिन में आपने {round(f.adherence_pct)}% खुराक समय पर लीं।" if hi
                                 else f"Over the last 7 days you took {round(f.adherence_pct)}% of your doses.")
            else:
                parts.append("आपकी कोई दवा दर्ज नहीं है।" if hi else "No medicines are on record for you.")
            parts.append("दवा बदलने या बंद करने का फ़ैसला सिर्फ़ डॉक्टर करेंगे।" if hi
                         else "Only your doctor should change or stop a medicine.")
        elif intent == "symptoms":
            if f.symptoms:
                parts.append(("हाल के लक्षण: " if hi else "Recent symptoms on record: ") + ", ".join(f.symptoms[:4]) + ".")
            parts.append("नए लक्षण 'आप कैसा महसूस कर रहे हैं?' में टिक करें — आपकी टीम तुरंत देख लेगी।" if hi
                         else "Tick any new symptom under 'How are you feeling?' so your care team sees it at once.")
        else:
            parts.append(
                "मैं आपकी रीडिंग, दवाइयाँ और लक्षण समझने में मदद कर सकता हूँ। जैसे पूछें: 'मेरी दवाइयाँ क्या हैं?' या 'मेरी रीडिंग कैसी है?'"
                if hi else
                "I can help you understand your readings, medicines and symptoms. Try: 'What are my medicines?' or 'How are my readings?'"
            )
    if f.level in ("Warning", "Critical"):
        parts.append("कृपया अभी नर्स को बताएं कि आप कैसा महसूस कर रहे हैं।" if hi else "Please tell a nurse how you're feeling now.")
    # de-duplicate while keeping order
    seen, out = set(), []
    for p in parts:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return " ".join(out)


# ---------------------------------------------------------------- the assistant

class Assistant:
    def __init__(self) -> None:
        self._client = None
        self._skip_until = 0.0

    def _call_gemini(self, f: HealthFacts, message: str, lang: str) -> str:
        from google import genai
        from google.genai import types

        if self._client is None:
            self._client = genai.Client(
                api_key=settings.gemini_api_key,
                http_options=types.HttpOptions(timeout=int(settings.gemini_timeout_s * 1000)),
            )
        convo = "\n".join(f"{h['role']}: {h['text']}" for h in f.history[-6:])
        prompt = json.dumps(f.payload(), ensure_ascii=False) + f"\n\nConversation so far:\n{convo}\n\nPatient: {message}"
        config = types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT.replace("LANGUAGE", LANGUAGE[lang]),
            temperature=0.3,
            max_output_tokens=400,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        )
        reply = self._client.models.generate_content(model=settings.gemini_model, contents=prompt, config=config)
        return (reply.text or "").strip()

    async def reply(self, f: HealthFacts, message: str, lang: str) -> dict:
        lang = "hi" if lang == "hi" else "en"
        if is_red_flag(message):
            return {"reply": URGENT[lang], "urgent": True, "source": "safety", "model": None}
        if settings.gemini_api_key and time.monotonic() >= self._skip_until:
            try:
                raw = await asyncio.wait_for(asyncio.to_thread(self._call_gemini, f, message, lang), timeout=settings.gemini_timeout_s)
                if raw and len(raw) <= MAX_REPLY and (lang != "hi" or DEVANAGARI.search(raw)):
                    return {"reply": raw, "urgent": False, "source": "gemini", "model": settings.gemini_model}
                log.warning("assistant reply failed validation; using built-in answers")
            except Exception as e:  # timeout, network, quota: all fall back
                log.warning("gemini unavailable for the assistant (%s)", type(e).__name__)
                self._skip_until = time.monotonic() + COOLDOWN_AFTER_FAILURE_S
        return {"reply": builtin_reply(f, message, lang), "urgent": False, "source": "builtin", "model": None}


assistant = Assistant()
