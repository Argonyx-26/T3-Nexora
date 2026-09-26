"""Adding a patient from a report: the offline reader, the create endpoint, and 'never simulate a real patient'."""

import base64

import pytest
from fastapi.testclient import TestClient

from app.intake.extract import clean_draft, parse_text
from app.intake.pdfmake import SAMPLE_REPORT, make_pdf
from app.sim.simulator import sim


@pytest.fixture()
def client():
    from app.main import app

    with TestClient(app) as c:
        c.post("/sim/reset")
        yield c


def test_the_builtin_reader_pulls_vitals_conditions_meds_and_history_from_a_pdf(client):
    pdf = base64.b64encode(make_pdf(SAMPLE_REPORT)).decode()
    r = client.post("/intake/extract", json={"filename": "report.pdf", "mime": "application/pdf", "data_base64": pdf})
    assert r.status_code == 200, r.text
    out = r.json()
    d = out["draft"]
    assert out["source"] == "builtin"
    assert (d["name"], d["age"], d["sex"]) == ("Anita Sharma", 61, "F")
    assert d["vitals"] == {"hr": 108, "spo2": 93, "sbp": 168, "dbp": 98, "rr": 24, "temp": 38.4, "glucose": 245}
    assert {"Hypertension", "Type 2 diabetes", "Pneumonia"} <= set(d["conditions"])
    meds = {m["name"]: m for m in d["medications"]}
    assert meds["Metformin"]["times"] == ["08:00", "20:00"] and meds["Insulin Glargine"]["critical"] is True
    assert {"breathlessness", "fever_chills", "cough"} <= set(d["symptoms"])
    assert [h["year"] for h in d["history"]] == ["2014", "2019"]


def test_negations_and_impossible_values_are_dropped():
    d = clean_draft(parse_text("Patient denies chest pain. No fever with chills.\nBP: 500/90  Pulse: 88  Temp: 98.6 F"))
    assert "chest_pain" not in d["symptoms"] and "fever_chills" not in d["symptoms"]
    assert "sbp" not in d["vitals"] and d["vitals"]["hr"] == 88 and d["vitals"]["temp"] == 37.0


def test_a_photo_without_gemini_says_so_instead_of_guessing(client):
    png = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 64).decode()
    out = client.post("/intake/extract", json={"filename": "r.png", "mime": "image/png", "data_base64": png}).json()
    assert out["found"] == [] and "Gemini" in out["message"]
    assert client.post("/intake/extract", json={"filename": "x.exe", "mime": "application/x-msdownload", "data_base64": png}).status_code == 415
    assert client.post("/intake/extract", json={}).status_code == 422


def test_creating_a_patient_scores_them_and_never_simulates_their_vitals(client):
    body = {
        "name": "Anita Sharma", "age": 61, "sex": "F", "conditions": ["Hypertension", "Pneumonia"],
        "medications": [{"name": "Metformin", "dose": "500 mg", "times": ["08:00", "20:00"]}],
        "vitals": {"hr": 108, "spo2": 93, "sbp": 168, "dbp": 98, "rr": 24, "temp": 38.4, "glucose": 245},
        "symptoms": ["breathlessness", "fever_chills"], "source": "pdf", "report_name": "report.pdf",
    }
    r = client.post("/patients", json=body)
    assert r.status_code == 200, r.text
    pid = r.json()["patient_id"]
    assert pid == "P011"
    p = client.get(f"/patients/{pid}").json()
    assert p["source"] == "intake" and p["bed"] == "N-11"
    risk = client.get(f"/patients/{pid}/risk").json()
    assert risk["news2"]["total"] >= 5 and risk["level"] in ("Warning", "Critical")  # NEWS2 6 → at least Warning
    assert any(a["patient_id"] == pid for a in client.get("/alerts").json())
    assert client.get(f"/patients/{pid}/insights").json()["data_quality"]["label"] == "Poor"  # one reading: AYU says so
    heads = [f["headline"] for f in risk["factors"] if f["kind"] == "baseline"]
    assert heads and all("typical adult range" in h for h in heads)  # no personal baseline claimed yet

    before = len(sim.states[pid].history)
    for _ in range(12):
        sim.step()
    assert len(sim.states[pid].history) == before  # no simulated readings for a real patient
    assert len(sim.states["P001"].history) > 0

    client.post(f"/patients/{pid}/vitals", json={"spo2": 91, "source": "staff"})
    assert len(sim.states[pid].history) == before + 1
    kinds = {e["kind"] for e in client.get(f"/patients/{pid}/timeline").json()}
    assert {"reading", "symptom", "note"} <= kinds


def test_create_validates(client):
    base = {"name": "X", "age": 40, "sex": "M", "vitals": {"hr": 80, "spo2": 97, "sbp": 120, "dbp": 80, "rr": 16, "temp": 36.8}}
    assert client.post("/patients", json={**base, "vitals": {**base["vitals"], "hr": 400}}).status_code == 422
    assert client.post("/patients", json={**base, "symptoms": ["zombie"]}).status_code == 422
    assert client.post("/patients", json={**base, "medications": [{"name": "A", "times": ["8am"]}]}).status_code == 422
    assert client.post("/patients", json={k: v for k, v in base.items() if k != "vitals"}).status_code == 422
