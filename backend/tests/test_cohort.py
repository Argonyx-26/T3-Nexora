"""The demo must not cry wolf: the seeded cohort at rest stays Stable and trend-free,
and the whole database → engine → API path works."""

import random
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.risk import PatientContext, Reading, assess
from app.risk.trend import trend_for
from app.seed.patients import PATIENTS
from app.seed.physiology import VitalGenerator


def _resting(p, hours=30, seed=3):
    gen = VitalGenerator(p["normals"], random.Random(f"{seed}-{p['id']}"))
    t0 = datetime(2026, 9, 20)
    return [Reading(ts=(ts := t0 + timedelta(minutes=5 * i)), **gen.next(ts)) for i in range(hours * 12)]


def test_resting_cohort_rarely_trends():
    checks = flags = 0
    for p in PATIENTS:
        history = _resting(p)
        for i in range(40, len(history), 6):
            for vital in p["normals"]:
                checks += 1
                flags += trend_for(history[: i + 1], vital, history[i].ts).flagged
    assert flags / checks < 0.005, f"{flags} false trend flags in {checks} checks"


@pytest.mark.parametrize("p", PATIENTS, ids=[p["id"] for p in PATIENTS])
def test_resting_patient_never_escalates(p):
    history = _resting(p)
    normals = {k: tuple(map(float, v)) for k, v in p["normals"].items()}
    for i in range(80, len(history), 12):
        r = assess(PatientContext(p["id"], history[: i + 1], declared_normals=normals, spo2_scale=p.get("spo2_scale", 1)))
        assert r.level == "Stable", (p["id"], history[i].ts, r.score, r.summary)


@pytest.fixture(scope="module")
def client():
    from app.main import app

    with TestClient(app) as c:
        yield c


def test_api_seeds_and_lists_patients_sorted_by_risk(client):
    res = client.get("/patients")
    assert res.status_code == 200
    patients = res.json()
    assert len(patients) == len(PATIENTS)
    scores = [p["risk"]["score"] for p in patients]
    assert scores == sorted(scores, reverse=True)
    assert all(p["risk"]["level"] in ("Stable", "Watch") for p in patients)


def test_api_risk_is_explainable(client):
    r = client.get("/patients/P001/risk").json()
    assert set(r) >= {"score", "level", "factors", "news2", "qsofa", "baselines", "recommended_action", "disclaimer"}
    assert r["computed_at"].endswith("Z")
    assert r["baselines"]["sbp"]["mean"] == pytest.approx(150, abs=6)  # Ramesh's own normal


def test_api_vitals_range_and_404(client):
    v = client.get("/patients/P003/vitals?range=6h").json()
    assert 60 <= len(v) <= 80
    assert client.get("/patients/NOPE").status_code == 404
    assert client.get("/patients/P003/vitals?range=banana").status_code == 422


def test_api_medications(client):
    meds = client.get("/patients/P005/medications").json()
    assert {m["name"] for m in meds} == {"Insulin glargine", "Insulin aspart"}
    assert all(m["critical"] for m in meds)
