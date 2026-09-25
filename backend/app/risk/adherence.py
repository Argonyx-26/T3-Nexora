"""Medication adherence over the last 7 days, and recently missed critical doses."""

from __future__ import annotations

from datetime import datetime, timedelta

from . import weights as W
from .types import AdherenceResult, Dose


def effective_status(dose: Dose, now: datetime) -> str:
    """A dose still 'pending' well after its time is, in practice, missed."""
    if dose.status == "pending" and dose.scheduled_at <= now - timedelta(hours=W.DOSE_GRACE_HOURS):
        return "missed"
    return dose.status


def adherence(doses: list[Dose], now: datetime) -> AdherenceResult:
    start = now - timedelta(days=W.ADHERENCE_WINDOW_DAYS)
    recent_start = now - timedelta(hours=W.CRITICAL_DOSE_LOOKBACK_HOURS)
    taken = missed = 0
    missed_critical = []
    for d in doses:
        if not (start <= d.scheduled_at <= now):
            continue
        status = effective_status(d, now)
        if status == "taken":
            taken += 1
        elif status == "missed":
            missed += 1
            if d.critical and d.scheduled_at >= recent_start:
                missed_critical.append(d)
    total = taken + missed
    pct = 100.0 * taken / total if total else None
    return AdherenceResult(pct=pct, taken=taken, missed=missed, missed_critical_recent=missed_critical)
