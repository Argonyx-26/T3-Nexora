"""AYU API — Intelligent Early Health-Risk Detection & Decision Support."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, func, select

from .api import patients
from .config import settings
from .db import create_tables, engine
from .models import Patient
from .risk import weights as W


@asynccontextmanager
async def lifespan(_: FastAPI):
    create_tables()
    with Session(engine) as s:
        empty = s.exec(select(func.count()).select_from(Patient)).one() == 0
    if empty:
        from .seed.seed import seed_database

        seed_database()
    yield


app = FastAPI(
    title="AYU API",
    version="0.1.0",
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


@app.get("/health", tags=["System"], summary="Liveness and configuration check")
def health():
    with Session(engine) as s:
        n = s.exec(select(func.count()).select_from(Patient)).one()
    return {
        "status": "ok",
        "patients": n,
        "gemini_configured": bool(settings.gemini_api_key),
        "disclaimer": W.DISCLAIMER,
    }


@app.get("/", include_in_schema=False)
def root():
    return {"name": "AYU API", "docs": "/docs", "health": "/health"}
