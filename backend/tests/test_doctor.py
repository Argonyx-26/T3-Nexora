"""The doctor's dashboard API: insights, the review queue, notes and appointments."""

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.risk.types import Reading
from app.services.insights import missed_patterns, mood_changes, sudden_changes
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


def history(now, **jumps):
    """Two hours of steady readings; `jumps` moves a vital for the last 20 minutes."""
    base = {"hr": 75.0, "spo2": 97.0, "sbp": 125.0, "dbp": 78.0, "rr": 15.0, "temp": 36.8}
    out = []
    for i in range(24, -1, -1):
        ts = now - timedelta(minutes=5 * i)
        v = dict(base)
        if i <= 4:
            for k, d in jumps.items():
                v[k] += d
        out.append(Reading(ts=ts, **v))
    return out


def test_sudden_changes_catch_bp_jumps_and_spo2_drops_but_not_a_steady_patient():
    now = datetime(2026, 9, 26, 6, 0)
    assert sudden_changes(history(now), now) == []
    found = {c["vital"]: c for c in sudden_changes(history(now, sbp=32, spo2=-4), now)}
    assert found["sbp"]["sudden"] and found["sbp"]["severity"] == "High" and found["sbp"]["delta"] == 32.0
    assert found["spo2"]["sudden"] and found["spo2"]["to"] == 93.0
    assert "hr" not in found


def test_missed_dose_patterns_find_the_time_the_weekday_and_the_streak():
    now = datetime(2026, 9, 26, 12, 0)
    doses = []
    for d in range(10):  # 22:00 IST insulin, missed on the last 4 nights
        at = datetime(2026, 9, 16, 16, 30) + timedelta(days=d)
        doses.append(("Insulin glargine", True, at, "missed" if d >= 6 else "taken"))
    kinds = {p["kind"] for p in missed_patterns(doses, now)}
    assert {"time", "streak", "critical"} <= kinds


def test_mood_drop_and_poor_sleep_are_flagged():
    t = datetime(2026, 9, 20, 3, 30)
    rows = [(t + timedelta(days=i), m, 2, s) for i, (m, s) in enumerate([(4, 2), (4, 2), (4, 1), (2, 1), (2, 1)])]
    summary, changes = mood_changes(rows)
    assert summary["count"] == 5 and summary["series"][-1]["ts"].endswith("Z")
    assert {c["kind"] for c in changes} == {"mood", "sleep"}


def test_patient_insights_have_confidence_quality_and_the_seeded_patterns(client):
    r = client.get("/patients/P007/insights").json()
    assert 35 <= r["confidence"] <= 95 and r["confidence_reasons"]
    assert r["data_quality"]["label"] in ("Good", "Fair")
    assert any(p["kind"] in ("weekday", "time") for p in r["missed_patterns"]), r["missed_patterns"]
    assert any(m["kind"] == "mood" for m in r["mood_changes"])
    assert r["mood"]["count"] == 5
    assert client.get("/patients/NOPE/insights").status_code == 404


def test_review_queue_puts_the_deteriorating_patient_first(client):
    client.post("/sim/scenario", json={"patient_id": "P003", "scenario": "sepsis"})
    ticks(12 * 3)
    queue = client.get("/insights").json()
    assert len(queue) == 10
    top = queue[0]
    assert top["patient_id"] == "P003" and top["priority"] in ("High", "Critical")
    assert top["alert"] is not None and top["factors"]
    ranks = {"Critical": 0, "High": 1, "Moderate": 2, None: 3}
    assert [ranks[q["priority"]] for q in queue] == sorted(ranks[q["priority"]] for q in queue)


def test_notes_follow_ups_and_what_the_patient_sees(client):
    assert client.post("/patients/P006/notes", json={"text": "Inhaler technique reviewed.", "visible": True}).status_code == 200
    assert client.post("/patients/P006/notes", json={"text": "Consider step-up therapy.", "visible": False}).status_code == 200
    f = client.post("/patients/P006/notes", json={"text": "Peak-flow diary for 3 days.", "kind": "followup", "visible": False,
                                                  "follow_up_on": "2026-09-29"}).json()
    assert f["visible"] is True  # follow-up instructions are always for the patient
    assert client.post("/patients/P006/notes", json={"text": "x", "follow_up_on": "29/09"}).status_code == 422
    assert len(client.get("/patients/P006/notes").json()) == 3
    assert len(client.get("/patients/P006/notes?visible_only=true").json()) == 2
    patient_view = [e for e in client.get("/patients/P006/timeline?audience=patient").json() if e["kind"] == "note"]
    doctor_view = [e for e in client.get("/patients/P006/timeline").json() if e["kind"] == "note"]
    assert len(patient_view) == 2 and len(doctor_view) == 3


def test_appointment_requests_and_video_consults(client):
    a = client.post("/patients/P004/appointments", json={"reason": "Breathless at night", "preferred": "tomorrow morning", "mode": "video"}).json()
    assert a["status"] == "requested" and a["video_url"] == ""
    assert client.get("/appointments?status=requested").json()[0]["id"] == a["id"]
    c = client.post(f"/appointments/{a['id']}", json={"status": "confirmed", "scheduled_for": "2026-09-27T04:30:00Z"}).json()
    assert c["status"] == "confirmed" and c["video_url"].startswith("https://meet.jit.si/AYU-")
    assert c["scheduled_for"].startswith("2026-09-27T04:30")
    assert any(e["kind"] == "appointment" for e in client.get("/patients/P004/timeline").json())
    assert client.post("/appointments/999999", json={"status": "done"}).status_code == 404
