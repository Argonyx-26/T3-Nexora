"""Reported symptoms: which red flags are active right now."""

from __future__ import annotations

from datetime import datetime, timedelta

from . import weights as W
from .types import SymptomEntry


def active_symptoms(entries: list[SymptomEntry], now: datetime) -> list[str]:
    """Known symptom keys reported within the lookback window, heaviest first."""
    start = now - timedelta(hours=W.SYMPTOM_LOOKBACK_HOURS)
    keys = {e.key for e in entries if start <= e.ts <= now and e.key in W.SYMPTOMS}
    return sorted(keys, key=lambda k: -W.SYMPTOMS[k]["weight"])


def red_flags(keys: list[str]) -> list[str]:
    return [k for k in keys if W.SYMPTOMS[k]["escalate"]]
