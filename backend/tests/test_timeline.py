"""Patient-side tracking: detailed symptoms, daily check-ins and the personal health timeline."""

import pytest
from fastapi.testclient import TestClient

from app.sim.simulator import sim


@pytest.fixture()
def client():
    from app.main import app

    with TestClient(app) as c:
        c.post("/sim/reset")
        yield c


def ticks(n: int):
    for _ in range(n):
        sim.step()


def test_symptoms_keep_severity_duration_and_frequency(client):
    r = client.post("/patients/P006/symptoms", json={"symptoms": ["cough"], "severity": "moderate", "duration": "days", "frequency": "on_off", "note": "worse at night"})
    assert r.status_code == 200
    log = client.get("/patients/P006/symptoms").json()
    top = log[0]
    assert (top["symptom"], top["severity"], top["duration"], top["frequency"]) == ("cough", "moderate", "days", "on_off")
    assert client.post("/patients/P006/symptoms", json={"symptoms": ["cough"], "severity": "extreme"}).status_code == 422


def test_daily_checkin_is_saved_listed_and_can_log_symptoms(client):
    r = client.post("/patients/P001/checkins", json={"mood": 4, "energy": 2, "sleep": 3, "note": "slept well", "symptoms": ["fatigue"]})
    assert r.status_code == 200, r.text
    listed = client.get("/patients/P001/checkins").json()
    assert listed[0]["mood"] == 4 and listed[0]["note"] == "slept well"
    assert any(x["symptom"] == "fatigue" for x in client.get("/patients/P001/symptoms").json())
    assert client.post("/patients/P001/checkins", json={"mood": 9, "energy": 2, "sleep": 2}).status_code == 422
    assert client.post("/patients/P001/checkins", json={"mood": 3, "energy": 2, "sleep": 2, "symptoms": ["zombie"]}).status_code == 422


def test_timeline_tells_the_story_of_a_deterioration(client):
    client.post("/sim/scenario", json={"patient_id": "P006", "scenario": "hypoxia"})
    ticks(12 * 4)
    alert = client.get("/alerts?patient_id=P006").json()[0]
    client.post(f"/alerts/{alert['id']}/ack", json={"note": "On my way", "by": "Dr. Rao"})
    client.post("/patients/P006/checkins", json={"mood": 2, "energy": 1, "sleep": 2})
    client.post("/patients/P006/vitals", json={"spo2": 93, "source": "patient"})

    events = client.get("/patients/P006/timeline?hours=24").json()
    kinds = {e["kind"] for e in events}
    assert {"status", "alert", "checkin", "reading", "dose"} <= kinds
    assert events == sorted(events, key=lambda e: e["ts"], reverse=True)
    subs = {e["sub"] for e in events if e["kind"] == "alert"}
    assert {"raised", "acknowledged"} <= subs
    ack = next(e for e in events if e["kind"] == "alert" and e["sub"] == "acknowledged")
    assert ack["by"] == "Dr. Rao" and "On my way" in ack["note"]
    assert any(e["kind"] == "status" and e["level"] in ("Watch", "Warning", "Critical") for e in events)


def test_a_quiet_ward_has_no_status_changes(client):
    ticks(12 * 3)
    events = client.get("/patients/P001/timeline?hours=3").json()
    assert not [e for e in events if e["kind"] == "status" and e["level"] in ("Warning", "Critical")]
