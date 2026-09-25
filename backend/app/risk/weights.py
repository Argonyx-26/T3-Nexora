"""Every tunable number in the AYU risk engine lives in this file.

The engine modules read from here and hold no magic numbers of their own, so a
clinician (or a judge) can audit exactly how a score is built by reading one page.
"""

DISCLAIMER = "AYU is decision support, not diagnosis. Final clinical judgment rests with the doctor."

# --- Vitals ------------------------------------------------------------------

VITALS = ("hr", "spo2", "sbp", "dbp", "rr", "temp", "glucose")

VITAL_META = {
    "hr": {"label": "Heart rate", "short": "HR", "unit": "bpm", "decimals": 0},
    "spo2": {"label": "SpO₂", "short": "SpO₂", "unit": "%", "decimals": 0},
    "sbp": {"label": "Systolic BP", "short": "SBP", "unit": "mmHg", "decimals": 0},
    "dbp": {"label": "Diastolic BP", "short": "DBP", "unit": "mmHg", "decimals": 0},
    "rr": {"label": "Respiratory rate", "short": "RR", "unit": "/min", "decimals": 0},
    "temp": {"label": "Temperature", "short": "Temp", "unit": "°C", "decimals": 1},
    "glucose": {"label": "Blood glucose", "short": "Glucose", "unit": "mg/dL", "decimals": 0},
}

# --- Final score → level -----------------------------------------------------

# (level, minimum score). Ordered low → high.
LEVELS = (("Stable", 0), ("Watch", 25), ("Warning", 50), ("Critical", 75))

URGENCY = {
    "Stable": "Routine",
    "Watch": "Routine",
    "Warning": "Review within 1 hr",
    "Critical": "Immediate",
}

ACTION_TEXT = {
    "Stable": "Continue routine monitoring.",
    "Watch": "Increase observation frequency and review at the next round.",
    "Warning": "Clinician review within 1 hour; repeat a full set of observations.",
    "Critical": "Immediate bedside assessment; consider escalation to the critical-care team.",
}

# --- 1. NEWS2 ----------------------------------------------------------------

NEWS2_POINTS_PER_UNIT = 4.0  # each NEWS2 point adds this much to the AYU score
NEWS2_CAP = 40.0
NEWS2_SINGLE_THREE_POINTS = 6.0  # extra when any single parameter scores 3

# --- 2. qSOFA ----------------------------------------------------------------

QSOFA_RR = 22  # RR >= this
QSOFA_SBP = 100  # SBP <= this
QSOFA_FLAG_AT = 2
QSOFA_POINTS = 15.0

# --- 3. Personal baseline ------------------------------------------------------

BASELINE_WINDOW_HOURS = 168  # learn from the last 7 days...
BASELINE_LAG_HOURS = 6  # ...but not the last 6 h, so a slow drift can't teach itself "normal"
BASELINE_MIN_READINGS = 24  # below this, fall back to the patient's declared normals
SMOOTH_READINGS = 3  # current value = mean of the last 3 readings (15 min), damps noise

Z_THRESHOLD = 2.5
PCT_THRESHOLD = 0.20  # or ≥20% away from baseline
Z_FULL_WEIGHT = 5.0  # |z| at which a deviation earns its full weight

# Floor on the baseline spread so a very steady patient can't turn noise into z = 10.
BASELINE_MIN_STD = {"hr": 3.0, "spo2": 1.0, "sbp": 5.0, "dbp": 4.0, "rr": 1.5, "temp": 0.25, "glucose": 10.0}

# Which direction away from baseline is concerning.
BAD_DIRECTION = {"hr": "both", "spo2": "down", "sbp": "both", "dbp": "both", "rr": "both", "temp": "both", "glucose": "both"}

DEVIATION_WEIGHT = {"spo2": 16.0, "rr": 12.0, "hr": 12.0, "sbp": 12.0, "temp": 10.0, "glucose": 10.0, "dbp": 6.0}
DEVIATION_CAP = 35.0

# --- 4. Trend ----------------------------------------------------------------

TREND_WINDOW_HOURS = 3.0  # matches how a drift is described at the bedside: "falling for 3 hours"
TREND_MIN_POINTS = 8
TREND_MIN_T = 3.0  # slope must be ≥3 standard errors from zero to count as sustained
TREND_MAX_AUTOCORR = 0.9  # cap on the residual autocorrelation used to widen the error

# (bad direction, slope per hour that counts as a drift)
TREND_THRESHOLD = {
    "spo2": ("down", 0.5),
    "hr": ("both", 4.0),
    "rr": ("up", 1.5),
    "sbp": ("both", 6.0),
    "dbp": ("up", 5.0),
    "temp": ("up", 0.3),
    "glucose": ("both", 15.0),
}
TREND_WEIGHT = {"spo2": 14.0, "rr": 10.0, "hr": 10.0, "sbp": 10.0, "temp": 8.0, "glucose": 8.0, "dbp": 5.0}
TREND_FULL_MULTIPLE = 2.0  # slope at 2× the threshold earns the full weight
TREND_CAP = 30.0

# --- 5. Medication adherence ---------------------------------------------------

ADHERENCE_WINDOW_DAYS = 7
ADHERENCE_TARGET_PCT = 90.0
ADHERENCE_MAX_POINTS = 12.0  # reached at 0% adherence, linear from the target
DOSE_GRACE_HOURS = 2  # a pending dose this far past its time counts as missed
CRITICAL_DOSE_LOOKBACK_HOURS = 24
CRITICAL_DOSE_POINTS = 8.0
MEDICATION_CAP = 20.0

# --- 6. Symptoms -------------------------------------------------------------

SYMPTOM_LOOKBACK_HOURS = 12
SYMPTOM_CAP = 35.0

# escalate=True → an immediate red flag: the score is raised to at least Critical.
SYMPTOMS = {
    "chest_pain": {"en": "Chest pain", "hi": "सीने में दर्द", "weight": 30.0, "escalate": True},
    "one_sided_weakness": {"en": "Weakness on one side", "hi": "शरीर के एक तरफ़ कमज़ोरी", "weight": 30.0, "escalate": True},
    "slurred_speech": {"en": "Slurred speech", "hi": "बोलने में लड़खड़ाहट", "weight": 30.0, "escalate": True},
    "fainting": {"en": "Fainting", "hi": "बेहोशी", "weight": 22.0, "escalate": True},
    "confusion": {"en": "New confusion", "hi": "भ्रम / उलझन", "weight": 22.0, "escalate": True},
    "coughing_blood": {"en": "Coughing blood", "hi": "खांसी में खून", "weight": 22.0, "escalate": True},
    "breathlessness": {"en": "Breathlessness", "hi": "सांस फूलना", "weight": 18.0, "escalate": False},
    "severe_headache": {"en": "Severe headache", "hi": "तेज़ सिरदर्द", "weight": 14.0, "escalate": False},
    "palpitations": {"en": "Palpitations", "hi": "दिल की धड़कन तेज़ होना", "weight": 10.0, "escalate": False},
    "blurred_vision": {"en": "Blurred vision", "hi": "धुंधला दिखना", "weight": 10.0, "escalate": False},
    "fever_chills": {"en": "Fever with chills", "hi": "बुखार और कंपकंपी", "weight": 10.0, "escalate": False},
    "reduced_urine": {"en": "Passing less urine", "hi": "पेशाब कम होना", "weight": 10.0, "escalate": False},
    "dizziness": {"en": "Dizziness", "hi": "चक्कर आना", "weight": 8.0, "escalate": False},
    "excessive_thirst": {"en": "Excessive thirst", "hi": "बहुत प्यास लगना", "weight": 6.0, "escalate": False},
    "vomiting": {"en": "Vomiting", "hi": "उल्टी", "weight": 6.0, "escalate": False},
    "leg_swelling": {"en": "Swelling in legs", "hi": "पैरों में सूजन", "weight": 6.0, "escalate": False},
    "frequent_urination": {"en": "Frequent urination", "hi": "बार-बार पेशाब", "weight": 4.0, "escalate": False},
    "cough": {"en": "Cough", "hi": "खांसी", "weight": 4.0, "escalate": False},
    "fatigue": {"en": "Unusual tiredness", "hi": "असामान्य थकान", "weight": 4.0, "escalate": False},
}

# --- 7. Escalation floors -------------------------------------------------------
# AYU never scores a patient lower than NEWS2 would escalate them: these raise the
# score to a minimum. Each raise appears as its own factor, so the total still adds up.

FLOOR_NEWS2_HIGH = 75  # NEWS2 ≥ 7 → Critical
FLOOR_NEWS2_MEDIUM = 50  # NEWS2 5–6 → Warning
FLOOR_NEWS2_SINGLE_THREE = 25  # any single parameter = 3 → Watch
FLOOR_QSOFA = 50  # qSOFA ≥ 2 → Warning
FLOOR_RED_FLAG_SYMPTOM = 75  # escalate=True symptom → Critical
