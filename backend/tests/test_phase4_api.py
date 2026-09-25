"""Phase 4 endpoints: explanations and readings typed in by a patient or ASHA worker."""

import re

import pytest
from fastapi.testclient import TestClient

DEVANAGARI = re.compile(r"[ऀ-ॿ]")


@pytest.fixture()
def client():
    from app.main import app

    with TestClient(app) as c:
        c.post("/sim/reset")
        yield c


def test_explanation_english_and_hindi(client):
    en = client.get("/patients/P001/explanation").json()
    assert en["source"] == "template"  # no GEMINI_API_KEY in tests
    assert en["doctor"] and en["patient"] and en["urgency"]
    assert en["disclaimer"].startswith("AYU is decision support")
    assert en["generated_at"].endswith("Z")
    hi = client.get("/patients/P001/explanation?lang=hi").json()
    assert hi["lang"] == "hi" and DEVANAGARI.search(hi["doctor"]) and DEVANAGARI.search(hi["patient"])


def test_explanation_follows_the_live_risk(client):
    client.post("/patients/P010/symptoms", json={"symptoms": ["chest_pain"]})
    e = client.get("/patients/P010/explanation").json()
    assert e["level"] == "Critical" and e["urgency"] == "Immediate"
    assert "chest pain" in e["doctor"].lower()


def test_explanation_validation(client):
    assert client.get("/patients/P001/explanation?lang=fr").status_code == 422
    assert client.get("/patients/NOPE/explanation").status_code == 404


def test_manual_reading_is_scored_at_once(client):
    risk = client.post("/patients/P006/vitals", json={"spo2": 88, "source": "asha"}).json()
    assert risk["news2"]["parameters"]["spo2"] == 3
    assert risk["level"] != "Stable"
    latest = client.get("/patients/P006/vitals?range=1h").json()[-1]
    assert latest["spo2"] == 88 and latest["source"] == "asha"
    assert latest["hr"] > 0  # unmeasured vitals carry forward


def test_manual_reading_validation(client):
    assert client.post("/patients/P006/vitals", json={"spo2": 120}).status_code == 422
    assert client.post("/patients/P006/vitals", json={}).status_code == 422
    assert client.post("/patients/P006/vitals", json={"hr": 80, "source": "robot"}).status_code == 422
    assert client.post("/patients/NOPE/vitals", json={"hr": 80}).status_code == 404


def test_manual_reading_keeps_the_stream_in_order(client):
    from app.sim.simulator import sim

    client.post("/patients/P006/vitals", json={"hr": 90})
    sim.step()
    ts = [r.ts for r in sim.states["P006"].history]
    assert ts == sorted(ts)
