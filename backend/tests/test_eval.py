import pytest

from app.eval.leadtime import Tick, episodes, evaluate, first, first_confirmed, run_once


@pytest.fixture(scope="module")
def result():
    return evaluate(seeds=1, horizon_h=6, rest_hours=6)


def test_runs_are_reproducible():
    a = run_once("P006", "hypoxia", 0, 2)
    b = run_once("P006", "hypoxia", 0, 2)
    assert [(t.score, t.news2) for t in a] == [(t.score, t.news2) for t in b]
    assert len(a) == 24


def test_helpers():
    ticks = [Tick(h=i, score=s, level="", news2=0, news2_trigger=False) for i, s in enumerate([0, 30, 0, 30, 30, 60])]
    assert first(ticks, lambda t: t.score >= 25) == 1
    assert first_confirmed(ticks, lambda t: t.score >= 25) == 4
    assert first(ticks, lambda t: t.score >= 90) is None
    assert episodes([False, True, True, False, True]) == 2


def test_result_shape(result):
    assert result["summary"]["runs"] == len(result["runs"]) > 0
    assert {"urgent", "first"} <= set(result["summary"]) and {"urgent", "first"} <= set(result["config"]["tiers"])
    assert {s["key"] for s in result["scenarios"]} == {"sepsis", "hypoxia", "hypertensive_crisis", "cardiac", "missed_meds"}
    assert len(result["rest"]) == 10
    assert result["example"]["points"]


def test_ayu_is_never_later_than_news2_at_the_urgent_tier(result):
    """The escalation floors guarantee it: NEWS2 >= 5 lifts AYU to Warning on the same reading."""
    assert result["summary"]["urgent"]["news2_first"] == 0
    for r in result["runs"]:
        u = r["urgent"]
        if u["news2_h"] is not None:
            assert u["ayu_h"] is not None and u["ayu_h"] <= u["news2_h"]


def test_ayu_is_ahead_on_most_runs(result):
    s = result["summary"]["urgent"]
    assert s["ayu_first"] > s["ties"]
    assert s["lead_h_median"] > 0


def test_missed_insulin_is_invisible_to_news2_at_first(result):
    mm = next(s for s in result["scenarios"] if s["key"] == "missed_meds")
    assert mm["urgent"]["ayu_never"] == 0
    irfan = next(r for r in result["runs"] if r["scenario"] == "missed_meds" and r["patient_id"] == "P005")
    assert irfan["urgent"]["news2_h"] is None or irfan["urgent"]["news2_h"] > irfan["urgent"]["ayu_h"] + 2


def test_lead_time_endpoint():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        r = c.get("/eval/lead-time")
        assert r.status_code == 200
        body = r.json()
        assert body["config"]["seeds"] == 1
        assert body["summary"]["urgent"]["news2_first"] == 0
