"""Deterministic explanations in English and Hindi, built from the engine's own factors.

Always available, instant and offline: this is what AYU shows when Gemini is not
configured, is slow, or answers with anything that fails validation.
"""

from __future__ import annotations

from ..risk import RiskResult
from ..risk import weights as W
from ..risk.types import Factor

LEVEL_HI = {"Stable": "स्थिर", "Watch": "निगरानी", "Warning": "चेतावनी", "Critical": "गंभीर"}
URGENCY_HI = {"Routine": "नियमित", "Review within 1 hr": "1 घंटे के भीतर जाँच", "Immediate": "तुरंत"}

VITAL_HI = {
    "hr": "हृदय गति",
    "spo2": "ऑक्सीजन स्तर (SpO₂)",
    "sbp": "सिस्टोलिक बीपी",
    "dbp": "डायस्टोलिक बीपी",
    "rr": "साँस की दर",
    "temp": "तापमान",
    "glucose": "ब्लड शुगर",
}
UNIT_HI = {"bpm": "प्रति मिनट", "%": "%", "mmHg": "mmHg", "/min": "प्रति मिनट", "°C": "°C", "mg/dL": "mg/dL"}
BAND_HI = {"Low": "कम", "Low-Medium": "कम-मध्यम", "Medium": "मध्यम", "High": "उच्च"}

PATIENT = {
    "en": {
        "Stable": "Your readings are within your usual range — keep taking your medicines on time.",
        "Watch": "Some of your readings are a little different from your usual, so your care team is keeping a closer eye on you.",
        "Warning": "Your readings have changed, and a doctor will check on you within the hour.",
        "Critical": "Your readings need attention now — please tell a nurse how you are feeling.",
    },
    "hi": {
        "Stable": "आपकी रीडिंग आपकी सामान्य सीमा में है — अपनी दवाइयाँ समय पर लेते रहें।",
        "Watch": "आपकी कुछ रीडिंग सामान्य से थोड़ी अलग हैं, इसलिए आपकी देखभाल टीम आप पर ध्यान से नज़र रख रही है।",
        "Warning": "आपकी रीडिंग में बदलाव आया है, एक घंटे के भीतर डॉक्टर आपको देखेंगे।",
        "Critical": "आपकी रीडिंग पर तुरंत ध्यान देना ज़रूरी है — कृपया नर्स को बताएं कि आप कैसा महसूस कर रहे हैं।",
    },
}


def _num(vital: str, v: float) -> str:
    return f"{v:.{W.VITAL_META[vital]['decimals']}f}"


def _with_unit(text: str, unit: str) -> str:
    return f"{text}{unit}" if unit == "%" else f"{text} {unit}"


def factor_hi(f: Factor) -> str:
    """One Hindi sentence for a factor, from its structured fields (not a translation)."""
    head, _, tail = f.factor.partition("_")
    if f.kind == "baseline" and head in VITAL_HI and f.value is not None and f.baseline is not None:
        unit = UNIT_HI[W.VITAL_META[head]["unit"]]
        side = "ऊपर" if f.value > f.baseline else "नीचे"
        return (f"{VITAL_HI[head]} {_with_unit(_num(head, f.value), unit)} है, जो इस मरीज़ के अपने सामान्य स्तर "
                f"{_with_unit(_num(head, f.baseline), unit)} से {_with_unit(_num(head, abs(f.value - f.baseline)), unit)} {side} है।")
    if f.kind == "trend" and head in VITAL_HI and f.value is not None:
        unit = UNIT_HI[W.VITAL_META[head]["unit"]]
        verb = "बढ़" if f.value > 0 else "घट"
        return f"{VITAL_HI[head]} पिछले {W.TREND_WINDOW_HOURS:g} घंटों से {_with_unit(f'{abs(f.value):.1f}', unit)} प्रति घंटा की दर से {verb} रहा है।"
    if f.factor == "news2":
        return f"NEWS2 स्कोर {f.value:.0f} है।"
    if f.factor == "news2_single_three":
        return "NEWS2 का एक पैरामीटर अकेले 3 अंक दे रहा है, जिसके लिए तुरंत जाँच ज़रूरी है।"
    if f.kind == "qsofa":
        return f"qSOFA {f.value:.0f}/3 है — सेप्सिस की जाँच करें।"
    if f.kind == "adherence" and f.value is not None:
        return f"पिछले {W.ADHERENCE_WINDOW_DAYS} दिनों में दवा का पालन {f.value:.0f}% रहा।"
    if f.kind == "medication":
        med = f.headline.removeprefix("Missed ").strip()
        return f"पिछले {W.CRITICAL_DOSE_LOOKBACK_HOURS} घंटों में ज़रूरी दवा {med} की {f.value:.0f} खुराक छूटी है।"
    if f.kind == "symptom":
        key = f.factor.removeprefix("symptom_")
        s = W.SYMPTOMS.get(key)
        if s:
            flag = " — यह एक गंभीर चेतावनी वाला लक्षण है।" if s["escalate"] else "।"
            return f"मरीज़ ने '{s['hi']}' बताया है{flag}"
    if f.kind == "escalation":
        return "सुरक्षा नियम के तहत स्तर को न्यूनतम सीमा तक बढ़ाया गया है।"
    return f.message  # unknown factor: better English than nothing


def _causes(risk: RiskResult) -> list[Factor]:
    named = [f for f in risk.factors if f.kind != "escalation"]
    return named or risk.factors


def _news2_context(risk: RiskResult, lang: str) -> str | None:
    """When AYU is ahead of NEWS2, say so — it is the whole point of the product."""
    if risk.level in ("Warning", "Critical") and risk.news2.total < 5 and not risk.news2.any_three:
        if lang == "hi":
            return f"अकेले NEWS2 अभी {risk.news2.total} ({BAND_HI[risk.news2.band]}) है, इसलिए सिर्फ़ थ्रेशोल्ड वाला स्कोर अभी चेतावनी नहीं देता।"
        return f"NEWS2 alone is {risk.news2.total} ({risk.news2.band}), so a threshold-only score would not yet escalate."
    return None


def template_explanation(risk: RiskResult, lang: str = "en") -> dict:
    lang = "hi" if lang == "hi" else "en"
    causes = _causes(risk)
    if lang == "hi":
        level, urgency = LEVEL_HI[risk.level], URGENCY_HI.get(risk.urgency, risk.urgency)
        if not causes:
            doctor = f"{level} (AYU {risk.score}/100)। सभी रीडिंग इस मरीज़ की अपनी सामान्य सीमा में हैं।"
        else:
            parts = [f"{level} जोखिम (AYU {risk.score}/100)।"] + [factor_hi(f) for f in causes[:2]]
            ctx = _news2_context(risk, "hi")
            if ctx:
                parts.append(ctx)
            doctor = " ".join(parts)
        doctor += f" सुझाई गई जाँच: {urgency}।"
    else:
        urgency = risk.urgency
        if not causes:
            doctor = f"{risk.level} (AYU {risk.score}/100). All readings are within this patient's own normal range."
        else:
            parts = [f"{risk.level} risk (AYU {risk.score}/100)."] + [f.message for f in causes[:2]]
            ctx = _news2_context(risk, "en")
            if ctx:
                parts.append(ctx)
            doctor = " ".join(parts)
        doctor += f" Urgency: {urgency}."
    return {"doctor": doctor, "patient": PATIENT[lang][risk.level], "urgency": urgency}
