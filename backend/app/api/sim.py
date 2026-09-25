"""Demo control panel: inject scenarios, change speed, pause, reset."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException

from ..schemas import ScenarioIn, SimState, SpeedIn
from ..services.hub import hub
from ..sim.scenarios import CATALOG, RECOVER_KEY, SCENARIOS
from ..sim.simulator import SPEEDS, sim

router = APIRouter(prefix="/sim", tags=["Simulator"])


async def _announce() -> SimState:
    state = sim.state()
    await hub.broadcast({"type": "sim", "sim": state.model_dump(mode="json")})
    return state


@router.get("", response_model=SimState, summary="Simulator clock, speed and active scenarios")
def sim_state():
    sim.ensure_loaded()
    return sim.state()


@router.get("/scenarios", summary="Scenarios that can be injected, with the patients they suit best")
def scenarios():
    return CATALOG


@router.post("/scenario", response_model=SimState, summary="Start a deterioration scenario (or recover) for one patient")
async def start_scenario(body: ScenarioIn):
    if sim.get(body.patient_id) is None:
        raise HTTPException(404, f"No patient {body.patient_id}")
    if body.scenario not in SCENARIOS and body.scenario != RECOVER_KEY:
        raise HTTPException(422, f"Unknown scenario. Choose one of {sorted([*SCENARIOS, RECOVER_KEY])}")
    message = await asyncio.to_thread(sim.start_scenario, body.patient_id, body.scenario)
    await hub.broadcast(message)
    return sim.state()


@router.post("/speed", response_model=SimState, summary="Set speed: 1x, 5x or 20x")
async def set_speed(body: SpeedIn):
    if body.speed not in SPEEDS:
        raise HTTPException(422, f"speed must be one of {SPEEDS}")
    sim.speed = body.speed
    return await _announce()


@router.post("/pause", response_model=SimState, summary="Pause the live stream")
async def pause():
    sim.paused = True
    return await _announce()


@router.post("/resume", response_model=SimState, summary="Resume the live stream")
async def resume():
    sim.paused = False
    return await _announce()


@router.post("/step", response_model=SimState, summary="Advance exactly one tick (useful while paused)")
async def step():
    message = await asyncio.to_thread(sim.step)
    await hub.broadcast(message)
    return sim.state()


@router.post("/reset", response_model=SimState, summary="Reset everything: fresh 7-day history, no alerts, 1x speed")
async def reset():
    sim.paused = True  # hold the loop while the database is rebuilt
    try:
        await asyncio.to_thread(sim.reset)
    finally:
        sim.paused = False
    await hub.broadcast(await asyncio.to_thread(sim.snapshot))
    return sim.state()
