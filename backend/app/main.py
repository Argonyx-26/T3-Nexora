"""AYU API — Intelligent Early Health-Risk Detection & Decision Support."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, func, select

from .api import alerts, doctor, intake, network, patients, ws
from .api import eval as eval_api
from .api import sim as sim_api
from .config import settings
from .db import create_tables, engine, schema_is_current
from .models import Patient
from .risk import weights as W
from .sim.simulator import sim

log = logging.getLogger("ayu")


@asynccontextmanager
async def lifespan(_: FastAPI):
    from .seed.seed import seed_database

    create_tables()
    if not schema_is_current():
        log.warning("database schema is out of date; rebuilding the demo data")
        seed_database()
    with Session(engine) as s:
        empty = s.exec(select(func.count()).select_from(Patient)).one() == 0
    if empty:
        seed_database()
    sim.load()
    if settings.sim_autostart:
        sim.start()
        asyncio.create_task(eval_api.lead_time_result())  # warm the evaluation in the background
    yield
    await sim.stop()


app = FastAPI(
    title="AYU API",
    version="0.2.0",
    summary="Early health-risk detection: NEWS2 + personal baseline + trend, explained.",
    description=(
        "AYU watches vitals, symptoms and medication adherence, and scores deterioration with a transparent, "
        "explainable engine.\n\n"
        f"**{W.DISCLAIMER}**"
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(patients.router)
app.include_router(intake.router)
app.include_router(network.router)
app.include_router(doctor.router)
app.include_router(alerts.router)
app.include_router(sim_api.router)
app.include_router(eval_api.router)
app.include_router(ws.router)


@app.get("/health", tags=["System"], summary="Liveness and configuration check")
def health():
    with Session(engine) as s:
        n = s.exec(select(func.count()).select_from(Patient)).one()
    return {
        "status": "ok",
        "patients": n,
        "gemini_configured": bool(settings.gemini_api_key),
        "sim": sim.state().model_dump(mode="json") if sim.loaded else None,
        "disclaimer": W.DISCLAIMER,
    }


@app.get("/", include_in_schema=False)
def root():
    return {"name": "AYU API", "docs": "/docs", "health": "/health"}


# ---------------------------------------------------------------- the web app, from the same server
# When frontend/dist exists (npm run build), the API also serves the app, so one address — a deployed
# link or the laptop's Wi-Fi address — gives both. A browser opening /patients/P003 gets the page;
# the app's own requests (Accept: application/json) get the API.

from pathlib import Path  # noqa: E402

from fastapi import Request  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402

DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
API_ONLY = ("/docs", "/redoc", "/openapi.json", "/ws/")

if (DIST / "index.html").exists():

    @app.middleware("http")
    async def spa(request: Request, call_next):
        path = request.url.path
        if request.method == "GET" and not path.startswith(API_ONLY):
            file = (DIST / path.lstrip("/")).resolve()
            if path != "/" and file.is_file() and DIST in file.parents:
                return FileResponse(file)
            if "text/html" in request.headers.get("accept", ""):
                # The same URL is also an API route: never let a browser cache reuse this page for the app's JSON request.
                return FileResponse(DIST / "index.html", headers={"Cache-Control": "no-store", "Vary": "Accept"})
        return await call_next(request)
