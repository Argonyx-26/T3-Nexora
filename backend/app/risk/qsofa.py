"""qSOFA — quick Sepsis-related Organ Failure Assessment (bedside sepsis screen)."""

from __future__ import annotations

from . import weights as W
from .types import QsofaResult, Reading


def qsofa(reading: Reading, altered_mentation: bool = False) -> QsofaResult:
    """altered_mentation lets a reported symptom (new confusion) count alongside the observed AVPU."""
    criteria = {
        "rr_ge_22": reading.rr >= W.QSOFA_RR,
        "sbp_le_100": reading.sbp <= W.QSOFA_SBP,
        "altered_mentation": reading.consciousness.upper() != "A" or altered_mentation,
    }
    score = sum(criteria.values())
    return QsofaResult(score=score, criteria=criteria, flag=score >= W.QSOFA_FLAG_AT)
