"""Phase 2: the live simulator, scenarios, alert rules, REST controls and the WebSocket."""

import pytest
from fastapi.testclient import TestClient

from app.sim.scenarios import SCENARIOS
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


def open_alerts(c, pid=None):
    q = "/alerts?status=open" + (f"&patient_id={pid}" if pid else "")
    return c.get(q).json()


def test_scenario_offsets_ramp_and_cap():
    s = SCENARIOS["hypoxia"]
    assert s.offsets(0) == {"spo2": 0, "rr": 0, "hr": 0}
    assert s.offsets(2)["spo2"] == pytest.approx(-2.0)
    assert s.offsets(100)["spo2"] == -12  # capped


def test_tick_advances_clock_and_streams_every_patient(client):
    before = client.get("/sim").json()["sim_time"]
    msg = sim.step()
    assert msg["type"] == "tick"
    assert len(msg["updates"]) == 10
    assert msg["sim"]["sim_time"] > before
    u = msg["updates"][0]
    assert {"patient_id", "vitals", "risk", "scenario"} <= set(u)
    assert {"score", "level", "alert_level", "top_factors"} <= set(u["risk"])


def test_quiet_ward_raises_no_alerts(client):
    ticks(36)  # 3 simulated hours
    assert open_alerts(client) == []


def test_single_reading_blip_does_not_alert(client):
    ps = sim.states["P006"]
    real = ps.gen.next
    calls = {"n": 0}

    def one_spike(ts, offsets=None, extra_noise=None):
        values = real(ts, offsets, extra_noise)
        calls["n"] += 1
        if calls["n"] == 1:
            values["sbp"] = 85.0  # NEWS2 scores this 3 on its own
        return values

    ps.gen.next = one_spike
    try:
        sim.step()
        assert ps.risk.level == "Watch"  # the blip itself is scored honestly
        ticks(3)
    finally:
        ps.gen.next = real
    assert open_alerts(client, "P006") == []
    assert ps.held == "Stable"


def test_hypoxia_raises_one_alert_that_escalates(client):
    assert client.post("/sim/scenario", json={"patient_id": "P006", "scenario": "hypoxia"}).status_code == 200
    ticks(12 * 5)
    alerts = open_alerts(client, "P006")
    assert len(alerts) == 1, "escalation must update the open alert, not spam new ones"
    a = alerts[0]
    assert a["level"] in ("Warning", "Critical")
    assert a["factors"] and a["disclaimer"].startswith("AYU is decision support")
    assert client.get("/patients/P006").json()["risk"]["level"] in ("Warning", "Critical")
    assert open_alerts(client, "P003") == []  # nobody else


def test_ayu_escalates_before_news2_in_sepsis(client):
    client.post("/sim/scenario", json={"patient_id": "P003", "scenario": "sepsis"})
    ayu_warning = news2_trigger = None
    for t in range(1, 12 * 6):
        sim.step()
        r = sim.states["P003"].risk
        if ayu_warning is None and r.score >= 50:
            ayu_warning = t
        if news2_trigger is None and (r.news2.total >= 5 or r.news2.any_three):
            news2_trigger = t
    assert ayu_warning is not None and news2_trigger is not None
    assert ayu_warning < news2_trigger


def test_ack_and_resolve_flow(client):
    client.post("/sim/scenario", json={"patient_id": "P001", "scenario": "hypertensive_crisis"})
    ticks(12 * 3)
    alert = open_alerts(client, "P001")[0]
    acked = client.post(f"/alerts/{alert['id']}/ack", json={"note": "Reviewed, amlodipine given", "by": "Dr. Rao"}).json()
    assert acked["status"] == "acknowledged" and acked["note"] == "Reviewed, amlodipine given"
    assert acked["acknowledged_by"] == "Dr. Rao"
    resolved = client.post(f"/alerts/{alert['id']}/resolve", json={"note": "BP settling"}).json()
    assert resolved["status"] == "resolved" and resolved["resolved_at"]
    assert open_alerts(client, "P001") == []
    assert client.post(f"/alerts/{alert['id']}/ack", json={}).status_code == 409
    assert client.post("/alerts/999999/ack", json={}).status_code == 404


def test_red_flag_symptom_escalates_immediately(client):
    risk = client.post("/patients/P010/symptoms", json={"symptoms": ["chest_pain"], "source": "patient"}).json()
    assert risk["level"] == "Critical"
    assert "chest_pain" in risk["active_symptoms"]
    assert open_alerts(client, "P010")[0]["level"] == "Critical"
    log = client.get("/patients/P010/symptoms").json()
    assert log[0]["symptom"] == "chest_pain" and log[0]["red_flag"] is True


def test_bad_symptom_is_rejected(client):
    assert client.post("/patients/P010/symptoms", json={"symptoms": ["banana"]}).status_code == 422
    assert client.post("/patients/NOPE/symptoms", json={"symptoms": ["cough"]}).status_code == 404


def test_recover_eases_back_and_resolves_symptoms(client):
    client.post("/sim/scenario", json={"patient_id": "P010", "scenario": "cardiac"})
    ticks(12 * 2)
    assert sim.states["P010"].risk.level == "Critical"
    client.post("/sim/scenario", json={"patient_id": "P010", "scenario": "recover"})
    ticks(12 * 4)
    r = sim.states["P010"].risk
    assert r.level in ("Stable", "Watch")
    assert r.active_symptoms == []
    assert all(s["resolved_at"] for s in client.get("/patients/P010/symptoms").json() if s["source"] == "sim")


def test_missed_meds_marks_doses_and_adds_risk(client):
    client.post("/sim/scenario", json={"patient_id": "P005", "scenario": "missed_meds"})
    ticks(12 * 3)
    risk = client.get("/patients/P005/risk").json()
    assert any(f["kind"] == "medication" for f in risk["factors"])
    assert risk["adherence"]["missed_critical_recent"]
    assert any(f["factor"] == "glucose_trend" or f["factor"] == "glucose_baseline" for f in risk["factors"])


def test_dose_endpoint_rescores(client):
    meds = client.get("/patients/P002/medications").json()
    dose = next(d for m in meds for d in m["doses"] if d["status"] == "pending")
    assert client.post("/doses", json={"dose_id": dose["id"], "status": "taken"}).status_code == 200
    assert client.post("/doses", json={"dose_id": dose["id"], "status": "eaten"}).status_code == 422


def test_speed_pause_and_validation(client):
    assert client.post("/sim/speed", json={"speed": 20}).json()["speed"] == 20
    assert client.post("/sim/speed", json={"speed": 3}).status_code == 422
    assert client.post("/sim/pause").json()["paused"] is True
    assert client.post("/sim/resume").json()["paused"] is False
    assert client.post("/sim/scenario", json={"patient_id": "P001", "scenario": "zombie"}).status_code == 422
    assert len(client.get("/sim/scenarios").json()) == 6


def test_an_alert_slows_a_fast_ward_back_to_1x(client):
    client.post("/sim/scenario", json={"patient_id": "P003", "scenario": "sepsis"})
    client.post("/sim/speed", json={"speed": 5})
    for _ in range(12 * 4):
        msg = sim.step()
        if msg["new_alerts"]:
            break
    assert msg["new_alerts"], "sepsis should open an alert within 4 simulated hours"
    assert msg["sim"]["speed"] == 1 and client.get("/sim").json()["speed"] == 1


def test_reset_clears_alerts_and_scenarios(client):
    client.post("/sim/scenario", json={"patient_id": "P006", "scenario": "hypoxia"})
    ticks(12 * 4)
    assert open_alerts(client)
    state = client.post("/sim/reset").json()
    assert state["scenarios"] == {} and state["speed"] == 1
    assert open_alerts(client) == []
    assert all(p["risk"]["level"] in ("Stable", "Watch") for p in client.get("/patients").json())


def test_websocket_sends_snapshot_then_live_messages(client):
    with client.websocket_connect("/ws/live") as ws:
        snap = ws.receive_json()
        assert snap["type"] == "snapshot"
        assert len(snap["updates"]) == 10 and "alerts" in snap
        client.post("/sim/step")
        msg = ws.receive_json()
        assert msg["type"] == "tick" and len(msg["updates"]) == 10
        ws.send_text("ping")
        assert ws.receive_json() == {"type": "pong"}


def test_doses_keep_being_scheduled_as_the_clock_runs_ahead(client):
    from datetime import timedelta

    sim.now += timedelta(days=4)  # e.g. a long 20x demo run
    sim.step()
    meds = client.get("/patients/P005/medications").json()
    upcoming = [d for m in meds for d in m["doses"] if d["status"] == "pending"]
    assert upcoming, "tomorrow's insulin must be scheduled"
    ids = [d["id"] for m in meds for d in m["doses"]]
    assert len(ids) == len(set(ids))
    sim.step()  # scheduling again adds nothing twice
    again = [d["id"] for m in client.get("/patients/P005/medications").json() for d in m["doses"]]
    assert len(again) == len(set(again))
