"""The demo cohort: ten synthetic patients. Names and details are fictional.

`normals` is each patient's own normal (mean, spread) — the reason AYU exists:
Ramesh's usual SBP is 150, Sunita lives at SpO2 90 on a prescribed COPD target,
Vikram is a runner with a resting heart rate of 52.
`demo` notes which stage scenario each patient is best suited to.
"""

PATIENTS = [
    {
        "id": "P001", "name": "Ramesh Kumar", "age": 67, "sex": "M", "ward": "Ward A", "bed": "A-03", "language": "hi",
        "conditions": ["Hypertension", "Type 2 diabetes"],
        "normals": {"hr": (78, 4), "spo2": (96, 0.8), "sbp": (150, 7), "dbp": (92, 5), "rr": (17, 1.2), "temp": (36.8, 0.2), "glucose": (150, 14)},
        "adherence": 0.84,
        "meds": [
            {"name": "Amlodipine", "dose": "5 mg", "purpose": "Blood pressure", "times": ["08:00"], "critical": True},
            {"name": "Metformin", "dose": "500 mg", "purpose": "Blood sugar", "times": ["08:00", "20:00"], "critical": False},
        ],
        "history_symptoms": [(96, "excessive_thirst")],
        "notes": "Usual SBP ~150 on treatment. NEWS2 scores this 0; AYU treats it as his normal.",
        "demo": "hypertensive_crisis",
    },
    {
        "id": "P002", "name": "Sunita Devi", "age": 58, "sex": "F", "ward": "Ward B", "bed": "B-11", "language": "hi",
        "conditions": ["COPD"], "spo2_scale": 2,
        "normals": {"hr": (86, 4), "spo2": (90, 1.0), "sbp": (128, 6), "dbp": (80, 4), "rr": (20, 1.2), "temp": (36.7, 0.2), "glucose": (105, 8)},
        "adherence": 0.9,
        "meds": [
            {"name": "Tiotropium inhaler", "dose": "18 mcg", "purpose": "COPD maintenance", "times": ["08:00"], "critical": True},
            {"name": "Budesonide-formoterol", "dose": "200/6 mcg", "purpose": "COPD maintenance", "times": ["08:00", "20:00"], "critical": False},
        ],
        "history_symptoms": [(72, "cough")],
        "notes": "Prescribed SpO₂ target 88–92% (NEWS2 scale 2).",
        "demo": "hypoxia",
    },
    {
        "id": "P003", "name": "Arjun Mehta", "age": 34, "sex": "M", "ward": "Surgical", "bed": "S-04", "language": "en",
        "conditions": ["Post-op day 2 (appendectomy)"],
        "normals": {"hr": (76, 4), "spo2": (98, 0.7), "sbp": (122, 6), "dbp": (78, 4), "rr": (15, 1.0), "temp": (37.0, 0.2), "glucose": (102, 8)},
        "adherence": 1.0,
        "meds": [
            {"name": "Ceftriaxone", "dose": "1 g IV", "purpose": "Antibiotic", "times": ["08:00", "20:00"], "critical": True},
            {"name": "Paracetamol", "dose": "650 mg", "purpose": "Pain / fever", "times": ["06:00", "14:00", "22:00"], "critical": False},
        ],
        "history_symptoms": [],
        "notes": "Recovering well after laparoscopic appendectomy.",
        "demo": "sepsis",
    },
    {
        "id": "P004", "name": "Lakshmi Iyer", "age": 72, "sex": "F", "ward": "Cardiac", "bed": "C-02", "language": "en",
        "conditions": ["Heart failure", "Atrial fibrillation"],
        "normals": {"hr": (84, 5), "spo2": (95, 0.9), "sbp": (112, 6), "dbp": (70, 4), "rr": (18, 1.2), "temp": (36.6, 0.2), "glucose": (110, 9)},
        "adherence": 0.93,
        "meds": [
            {"name": "Bisoprolol", "dose": "2.5 mg", "purpose": "Heart rate control", "times": ["08:00"], "critical": True},
            {"name": "Apixaban", "dose": "5 mg", "purpose": "Blood thinner (stroke prevention)", "times": ["08:00", "20:00"], "critical": True},
            {"name": "Furosemide", "dose": "40 mg", "purpose": "Fluid (diuretic)", "times": ["08:00"], "critical": False},
        ],
        "history_symptoms": [(120, "leg_swelling")],
        "notes": "Rate-controlled AF.",
        "demo": "cardiac",
    },
    {
        "id": "P005", "name": "Mohammed Irfan", "age": 45, "sex": "M", "ward": "Ward A", "bed": "A-08", "language": "hi",
        "conditions": ["Type 1 diabetes"],
        "normals": {"hr": (74, 4), "spo2": (98, 0.7), "sbp": (124, 6), "dbp": (80, 4), "rr": (15, 1.0), "temp": (36.8, 0.2), "glucose": (135, 15)},
        "adherence": 0.95,
        "meds": [
            {"name": "Insulin glargine", "dose": "20 units", "purpose": "Basal insulin", "times": ["22:00"], "critical": True},
            {"name": "Insulin aspart", "dose": "6 units", "purpose": "Mealtime insulin", "times": ["08:00", "13:00", "20:00"], "critical": True},
        ],
        "history_symptoms": [],
        "notes": "On basal-bolus insulin.",
        "demo": "missed_meds",
    },
    {
        "id": "P006", "name": "Priya Nair", "age": 29, "sex": "F", "ward": "Ward B", "bed": "B-02", "language": "en",
        "conditions": ["Asthma"],
        "normals": {"hr": (80, 4), "spo2": (97, 0.8), "sbp": (112, 6), "dbp": (72, 4), "rr": (16, 1.0), "temp": (36.8, 0.2), "glucose": (95, 7)},
        "adherence": 0.88,
        "meds": [
            {"name": "Budesonide inhaler", "dose": "200 mcg", "purpose": "Asthma control", "times": ["08:00", "20:00"], "critical": False},
            {"name": "Montelukast", "dose": "10 mg", "purpose": "Asthma control", "times": ["21:00"], "critical": False},
        ],
        "history_symptoms": [],
        "notes": "Admitted for observation after an asthma flare.",
        "demo": "hypoxia",
    },
    {
        "id": "P007", "name": "Harbhajan Singh", "age": 80, "sex": "M", "ward": "Ward A", "bed": "A-12", "language": "hi",
        "conditions": ["Chronic kidney disease (stage 3)", "Hypertension"],
        "normals": {"hr": (70, 4), "spo2": (95, 0.9), "sbp": (145, 7), "dbp": (85, 5), "rr": (18, 1.2), "temp": (36.5, 0.2), "glucose": (118, 10)},
        "adherence": 0.72,
        "meds": [
            {"name": "Amlodipine", "dose": "10 mg", "purpose": "Blood pressure", "times": ["08:00"], "critical": True},
            {"name": "Furosemide", "dose": "20 mg", "purpose": "Fluid (diuretic)", "times": ["08:00"], "critical": False},
        ],
        "history_symptoms": [],
        "notes": "Often forgets morning tablets; family reminds by phone.",
        "demo": "hypertensive_crisis",
    },
    {
        "id": "P008", "name": "Kavita Joshi", "age": 52, "sex": "F", "ward": "Ward B", "bed": "B-07", "language": "hi",
        "conditions": ["Hypothyroidism", "Anaemia"],
        "normals": {"hr": (84, 4), "spo2": (97, 0.8), "sbp": (118, 6), "dbp": (76, 4), "rr": (16, 1.0), "temp": (36.6, 0.2), "glucose": (98, 7)},
        "adherence": 0.9,
        "meds": [
            {"name": "Levothyroxine", "dose": "50 mcg", "purpose": "Thyroid", "times": ["06:00"], "critical": False},
            {"name": "Ferrous sulphate", "dose": "200 mg", "purpose": "Iron (anaemia)", "times": ["14:00"], "critical": False},
        ],
        "history_symptoms": [(50, "fatigue")],
        "notes": "",
        "demo": "sepsis",
    },
    {
        "id": "P009", "name": "Vikram Rao", "age": 26, "sex": "M", "ward": "Ward A", "bed": "A-01", "language": "en",
        "conditions": ["Dengue (recovering)"],
        "normals": {"hr": (52, 3), "spo2": (98, 0.6), "sbp": (114, 5), "dbp": (70, 4), "rr": (13, 1.0), "temp": (37.0, 0.2), "glucose": (95, 7)},
        "adherence": 0.95,
        "meds": [
            {"name": "Paracetamol", "dose": "500 mg", "purpose": "Fever", "times": ["08:00", "20:00"], "critical": False},
        ],
        "history_symptoms": [],
        "notes": "Competitive runner: resting HR ~52. An HR of 85 is normal to NEWS2 but +60% for him.",
        "demo": "sepsis",
    },
    {
        "id": "P010", "name": "Fatima Sheikh", "age": 63, "sex": "F", "ward": "Cardiac", "bed": "C-05", "language": "en",
        "conditions": ["Post-MI (3 months)", "High cholesterol"],
        "normals": {"hr": (68, 4), "spo2": (97, 0.8), "sbp": (126, 6), "dbp": (78, 4), "rr": (16, 1.0), "temp": (36.7, 0.2), "glucose": (112, 9)},
        "adherence": 0.92,
        "meds": [
            {"name": "Aspirin", "dose": "75 mg", "purpose": "Blood thinner", "times": ["08:00"], "critical": True},
            {"name": "Metoprolol", "dose": "25 mg", "purpose": "Heart protection", "times": ["08:00", "20:00"], "critical": True},
            {"name": "Atorvastatin", "dose": "40 mg", "purpose": "Cholesterol", "times": ["21:00"], "critical": False},
        ],
        "history_symptoms": [],
        "notes": "Cardiac rehab in progress.",
        "demo": "cardiac",
    },
]

# Past medical history for the doctor's profile (synthetic, like everything in this cohort).
HISTORY: dict[str, list[dict]] = {
    "P001": [{"year": "2012", "event": "Hypertension diagnosed"}, {"year": "2017", "event": "Type 2 diabetes diagnosed"},
             {"year": "2024", "event": "Amlodipine increased to 5 mg"}],
    "P002": [{"year": "2016", "event": "COPD diagnosed (ex-smoker)"}, {"year": "2023", "event": "Admitted with a chest infection"},
             {"year": "2024", "event": "SpO₂ target set to 88–92%"}],
    "P003": [{"year": "2026", "event": "Laparoscopic appendectomy, 2 days ago"}],
    "P004": [{"year": "2019", "event": "Atrial fibrillation diagnosed"}, {"year": "2022", "event": "Heart failure (HFrEF) diagnosed"},
             {"year": "2025", "event": "Admitted for fluid overload"}],
    "P005": [{"year": "2003", "event": "Type 1 diabetes diagnosed"}, {"year": "2021", "event": "Diabetic ketoacidosis, ICU stay"}],
    "P006": [{"year": "2010", "event": "Asthma diagnosed in childhood"}, {"year": "2026", "event": "Admitted after an asthma flare"}],
    "P007": [{"year": "2015", "event": "Hypertension diagnosed"}, {"year": "2020", "event": "Chronic kidney disease, stage 3"},
             {"year": "2025", "event": "Lives alone; family reminds him about medicines by phone"}],
    "P008": [{"year": "2018", "event": "Hypothyroidism diagnosed"}, {"year": "2025", "event": "Iron-deficiency anaemia found"}],
    "P009": [{"year": "2026", "event": "Dengue fever, recovering; platelets back to normal"}],
    "P010": [{"year": "2026", "event": "Heart attack (STEMI), stent placed 3 months ago"}, {"year": "2026", "event": "Cardiac rehab started"}],
}

# Daily check-ins for the last few days (mood 1–5, energy 1–3, sleep 1–3), oldest first.
# Most people are steady; Harbhajan's mood is sliding (and his weekend doses slip), Lakshmi sleeps badly.
CHECKINS: dict[str, list[tuple[int, int, int]]] = {
    "P007": [(4, 2, 2), (4, 2, 2), (3, 2, 1), (2, 1, 1), (2, 1, 1)],
    "P004": [(3, 2, 2), (3, 1, 1), (3, 2, 1), (3, 1, 1), (3, 2, 1)],
}
DEFAULT_CHECKINS = [(4, 2, 3), (4, 3, 2), (3, 2, 2), (4, 2, 3), (4, 3, 3)]

# Weekday → chance of missing a dose (Python weekday: Mon 0 … Sun 6), overriding `adherence` on those days.
# Harbhajan's family calls on weekdays; at weekends his morning tablets slip.
MISS_WEEKDAYS: dict[str, dict[int, float]] = {"P007": {5: 0.9, 6: 0.9, 0: 0.05, 1: 0.05, 2: 0.05, 3: 0.05, 4: 0.05}}

# The demo network: a city hospital and a village primary health centre (fictional names and people).
HOSPITALS = [
    {"id": "H01", "name": "City General Hospital", "city": "Bengaluru", "kind": "hospital"},
    {"id": "H02", "name": "Primary Health Centre, Hosahalli", "city": "Bengaluru Rural", "kind": "phc"},
]
DOCTORS = [
    {"id": "D01", "name": "Dr. Meera Rao", "specialty": "General Medicine", "hospital_id": "H01"},
    {"id": "D02", "name": "Dr. Arvind Kulkarni", "specialty": "Cardiology", "hospital_id": "H01"},
    {"id": "D03", "name": "Dr. Sana Qureshi", "specialty": "Pulmonology", "hospital_id": "H01"},
    {"id": "D04", "name": "Dr. Rohan Iyer", "specialty": "Surgery", "hospital_id": "H01"},
    {"id": "D05", "name": "Dr. Kavya Menon", "specialty": "Endocrinology", "hospital_id": "H01"},
    {"id": "D06", "name": "Dr. Prakash Gowda", "specialty": "General Medicine", "hospital_id": "H02"},
]
