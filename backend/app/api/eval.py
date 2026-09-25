"""GET /eval/lead-time: AYU vs threshold-only NEWS2 across every scenario (the proof slide)."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter

from ..config import settings
from ..eval.leadtime import evaluate

router = APIRouter(prefix="/eval", tags=["Evaluation"])
log = logging.getLogger("ayu.eval")

_cache: dict = {}
_lock = asyncio.Lock()


async def lead_time_result() -> dict:
    """Computed once (deterministic seeds), then served from memory."""
    async with _lock:
        if "result" not in _cache:
            _cache["result"] = await asyncio.to_thread(evaluate, settings.eval_seeds)
            log.info("evaluation ready: %d runs", _cache["result"]["summary"]["runs"])
        return _cache["result"]


@router.get(
    "/lead-time",
    summary="How much earlier AYU escalates than threshold-only NEWS2, per scenario",
    description=(
        "Runs every scenario on the patients it suits over several seeds and reports, on two matched tiers, when "
        "NEWS2 and AYU first escalate: **urgent** (NEWS2 ≥ 5 vs AYU Warning) and **first** (NEWS2 ≥ 5 or a single 3 "
        "vs AYU Watch confirmed). Also counts alarms on patients at rest. Synthetic data, not clinical validation."
    ),
)
async def lead_time():
    return await lead_time_result()
