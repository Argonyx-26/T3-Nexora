"""Which doctor looks after which patient — a transparent rule, not a black box.

For a patient at a hospital, among the doctors there who are on duty:

1. Specialty: the patient's conditions map to the specialty that should lead their care
   (a surgical patient → Surgery, heart → Cardiology, lungs → Pulmonology, diabetes or
   thyroid → Endocrinology, everything else → General Medicine). A matching doctor scores
   highest; General Medicine is the fallback for any patient.
2. Load, weighted by acuity: each of a doctor's patients counts by how unwell they are
   (Critical 4, Warning 3, Watch 2, Stable 1), so two stable patients weigh less than one
   critical one. A doctor over their capacity is only chosen if nobody else can take the patient.
3. A sick patient (Warning or Critical) also avoids a doctor who already has two or more
   sick patients, when another suitable doctor is free.

Every assignment carries its reason in words. A doctor can override it; when a doctor goes
off duty, their patients are reassigned by the same rule.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

ACUITY = {"Critical": 4, "Warning": 3, "Watch": 2, "Stable": 1}
SICK = ("Warning", "Critical")

# Order matters: the first match leads care (an operation outranks a background diagnosis).
SPECIALTY_RULES: list[tuple[str, str]] = [
    ("Surgery", r"post-?op|appendectomy|appendicectomy|surgery|fracture|laparotomy"),
    ("Cardiology", r"heart|cardiac|atrial fibrillation|\bmi\b|myocardial|coronary|angina|post-mi"),
    ("Pulmonology", r"copd|asthma|pneumonia|respiratory|tuberculosis|\btb\b|bronch|lung"),
    ("Endocrinology", r"diabet|thyroid|endocrin"),
]
GENERAL = "General Medicine"


def specialty_for(conditions: list[str]) -> tuple[str, str | None]:
    """→ (specialty, the condition that decided it)."""
    for specialty, pattern in SPECIALTY_RULES:
        for c in conditions:
            if re.search(pattern, c, re.I):
                return specialty, c
    return GENERAL, None


@dataclass
class DoctorLoad:
    id: str
    name: str
    specialty: str
    on_duty: bool
    max_patients: int
    levels: list[str]  # levels of the patients already assigned

    @property
    def weighted(self) -> int:
        return sum(ACUITY.get(lv, 1) for lv in self.levels)

    @property
    def sick(self) -> int:
        return sum(1 for lv in self.levels if lv in SICK)


def pick_doctor(conditions: list[str], level: str, doctors: list[DoctorLoad]) -> tuple[DoctorLoad | None, str]:
    """Choose a doctor for one patient. Pure: the caller supplies the doctors and their loads."""
    want, because = specialty_for(conditions)
    on = [d for d in doctors if d.on_duty]
    if not on:
        return None, "No doctor on duty at this site — waiting for assignment"

    def score(d: DoctorLoad) -> float:
        s = 0.0
        if d.specialty == want:
            s += 100
        elif d.specialty == GENERAL:
            s += 40
        s -= 6 * d.weighted
        if len(d.levels) >= d.max_patients:
            s -= 1000  # full: only if nobody else can
        if level in SICK and d.sick >= 2:
            s -= 60
        return s

    best = max(on, key=lambda d: (score(d), -len(d.levels), d.id))
    if best.specialty == want:
        why = f"{want}" + (f" for {because.lower()}" if because else "")
    elif best.specialty == GENERAL:
        has = any(d.specialty == want for d in on)
        why = ("General Medicine" if want == GENERAL
               else f"General Medicine ({want.lower()} doctors here are full)" if has
               else f"General Medicine (no {want.lower()} doctor on duty here)")
    else:
        why = f"{best.specialty} (closest free doctor)"
    load = f"{len(best.levels)} patient{'s' if len(best.levels) != 1 else ''}"
    if best.sick:
        load += f", {best.sick} high-risk"
    full = " · over capacity" if len(best.levels) >= best.max_patients else ""
    return best, f"{why} · on duty · {load}{full}"
