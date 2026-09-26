"""Many sites, who looks after whom, and patients registering themselves."""

import pytest
from fastapi.testclient import TestClient

from app.services.assign import DoctorLoad, pick_doctor, specialty_for
from app.sim.simulator import sim

VITALS = {"hr": 84, "spo2": 97, "sbp": 128, "dbp": 82, "rr": 16, "temp": 36.9}


@pytest.fixture()
def client():
    from app.main import app

    with TestClient(app) as c:
        c.post("/sim/reset")
        yield c


def test_specialty_follows_the_condition_that_should_lead_care():
    assert specialty_for(["Post-op day 1 (hernia repair)", "Type 2 diabetes"])[0] == "Surgery"
    assert specialty_for(["Hypertension", "Heart failure"])[0] == "Cardiology"
    assert specialty_for(["Asthma"])[0] == "Pulmonology"
    assert specialty_for(["Dengue"])[0] == "General Medicine"


def test_load_is_weighted_by_acuity_and_sick_patients_are_spread():
    a = DoctorLoad("A", "Dr A", "General Medicine", True, 6, ["Critical", "Warning"])
    b = DoctorLoad("B", "Dr B", "General Medicine", True, 6, ["Stable", "Stable", "Stable"])
    doc, why = pick_doctor(["Dengue"], "Warning", [a, b])
    assert doc.id == "B" and "General Medicine" in why
    off = DoctorLoad("C", "Dr C", "Cardiology", False, 6, [])
    assert pick_doctor(["Heart failure"], "Stable", [off])[0] is None


def test_every_seeded_patient_has_a_doctor_with_a_reason(client):
    pts = client.get("/patients").json()
    assert all(p["doctor_id"] and p["assigned_reason"] for p in pts)
    arjun = next(p for p in pts if p["id"] == "P003")
    assert arjun["doctor_id"] == "D04" and arjun["assigned_reason"].startswith("Surgery")
    hs = {h["id"]: h for h in client.get("/hospitals").json()}
    assert hs["H01"]["patients"] == 10 and hs["H02"]["kind"] == "phc" and hs["H02"]["patients"] == 0


def test_off_duty_hands_patients_over_and_manual_override_works(client):
    out = client.post("/doctors/D03/duty", json={"on_duty": False}).json()
    moved = {m["patient_id"]: m for m in out["handed_over"]}
    assert set(moved) == {"P002", "P006"} and all(m["doctor_id"] and m["doctor_id"] != "D03" for m in moved.values())
    assert sim.states["P002"].info["doctor_id"] != "D03"
    r = client.post("/patients/P002/assign", json={"doctor_id": "D01", "by": "Dr. Meera Rao"}).json()
    assert r["doctor_id"] == "D01" and "Dr. Meera Rao" in r["reason"]
    assert client.post("/patients/P002/assign", json={"doctor_id": "D06"}).status_code == 422  # other site
    assert any("Your doctor is now" in n["text"] for n in client.get("/patients/P002/notes?visible_only=true").json())


def test_a_patient_can_register_themselves_at_a_phc(client):
    body = {"name": "Lalitha Bai", "age": 58, "sex": "F", "conditions": ["Hypertension"], "vitals": VITALS,
            "source": "self", "hospital_id": "H02", "language": "hi"}
    assert client.post("/patients", json=body).status_code == 422  # no consent
    r = client.post("/patients", json={**body, "consent": True})
    assert r.status_code == 200, r.text
    p = r.json()["patient"]
    assert p["registered_by"] == "self" and p["hospital_id"] == "H02" and p["doctor_id"] == "D06"
    q = next(x for x in client.get("/insights").json() if x["patient_id"] == p["id"])
    assert any("Self-registered" in t for t in q["needs_review"]) and q["hospital_id"] == "H02"
    assert client.post("/patients", json={**body, "consent": True, "hospital_id": "H99"}).status_code == 422


def test_referral_moves_the_patient_and_their_record_to_the_hospital(client):
    body = {"name": "Lalitha Bai", "age": 58, "sex": "F", "conditions": ["Heart failure"], "source": "self", "consent": True,
            "hospital_id": "H02", "vitals": {"hr": 118, "spo2": 91, "sbp": 96, "dbp": 60, "rr": 26, "temp": 37.9}}
    pid = client.post("/patients", json=body).json()["patient_id"]
    assert client.get(f"/patients/{pid}").json()["doctor_id"] == "D06"
    r = client.post(f"/patients/{pid}/refer", json={"hospital_id": "H01", "reason": "Needs cardiology review", "by": "Dr. Prakash Gowda"})
    assert r.status_code == 200, r.text
    assert r.json()["doctor_id"] == "D02"  # cardiology at the hospital
    p = client.get(f"/patients/{pid}").json()
    assert p["hospital_id"] == "H01" and p["doctor_id"] == "D02"
    assert len(client.get(f"/patients/{pid}/vitals?range=24h").json()) >= 1  # the record came along
    notes = [n["text"] for n in client.get(f"/patients/{pid}/notes").json()]
    assert any("Referred from Primary Health Centre" in t and "cardiology" in t for t in notes)
    assert client.post(f"/patients/{pid}/refer", json={"hospital_id": "H01"}).status_code == 409
    assert client.post(f"/patients/{pid}/refer", json={"hospital_id": "H99"}).status_code == 422
