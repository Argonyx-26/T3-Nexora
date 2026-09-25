"""The patient health assistant: safety first, facts only, no identifiers, works offline."""

import json

import pytest
from fastapi.testclient import TestClient

from app.api.patients import health_facts
from app.explain.assistant import builtin_reply, is_red_flag


@pytest.fixture()
def client():
    from app.main import app

    with TestClient(app) as c:
        c.post("/sim/reset")
        yield c


def ask(c, message, lang="en", pid="P001"):
    r = c.post(f"/patients/{pid}/chat", json={"message": message, "lang": lang})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.parametrize("message", ["I have chest pain", "I can't breathe properly", "mujhe seene me dard hai", "सीने में दर्द हो रहा है"])
def test_red_flags_get_the_urgent_reply_before_any_model(client, message):
    out = ask(client, message, lang="hi" if "सीने" in message else "en")
    assert out["urgent"] is True and out["source"] == "safety"
    assert "108" in out["reply"]


def test_everyday_words_are_not_red_flags():
    assert not is_red_flag("What are the benefits of my medicine?")
    assert not is_red_flag("How is my blood pressure today?")


def test_medicine_question_lists_their_own_medicines_and_defers_changes(client):
    out = ask(client, "What are my medicines?")
    assert out["urgent"] is False and out["source"] == "builtin"
    assert "Amlodipine" in out["reply"] and "Metformin" in out["reply"]
    assert "doctor" in out["reply"].lower()
    assert out["disclaimer"].startswith("AYU is decision support")


def test_hindi_status_answer_is_in_devanagari(client):
    out = ask(client, "मेरी हालत कैसी है?", lang="hi")
    assert any("ऀ" <= ch <= "ॿ" for ch in out["reply"])
    assert "AYU" in out["reply"]


def test_readings_answer_uses_the_latest_values(client):
    out = ask(client, "How is my heart rate and oxygen?")
    assert "heart rate" in out["reply"] and "oxygen" in out["reply"]


def test_the_assistant_never_sees_who_the_patient_is(client):
    facts = health_facts("P001")
    blob = json.dumps(facts.payload(), ensure_ascii=False)
    for secret in ("Ramesh", "Kumar", "P001", "A-03"):
        assert secret not in blob


def test_unknown_questions_get_help_not_a_guess(client):
    f = health_facts("P001")
    reply = builtin_reply(f, "Tell me about cricket", "en")
    assert "I can help you understand" in reply


def test_bad_input_is_rejected(client):
    assert client.post("/patients/P001/chat", json={"message": ""}).status_code == 422
    assert client.post("/patients/NOPE/chat", json={"message": "hi"}).status_code == 404
