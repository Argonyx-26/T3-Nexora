"""Settings from .env (repo root first, then backend/). Every value has a safe offline default."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BACKEND_DIR.parent

load_dotenv(ROOT_DIR / ".env")
load_dotenv(BACKEND_DIR / ".env")


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


def _list(name: str, default: str) -> list[str]:
    return [s.strip() for s in os.getenv(name, default).split(",") if s.strip()]


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv("DATABASE_URL", f"sqlite:///{BACKEND_DIR / 'ayu.db'}")
    cors_origins: list[str] = field(
        default_factory=lambda: _list("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    )
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "").strip()
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
    gemini_timeout_s: float = float(os.getenv("GEMINI_TIMEOUT_S", "4"))
    seed: int = int(os.getenv("AYU_SEED", "42"))
    history_days: int = int(os.getenv("AYU_HISTORY_DAYS", "7"))
    tick_seconds: float = float(os.getenv("SIM_TICK_SECONDS", "2"))
    minutes_per_tick: int = int(os.getenv("SIM_MINUTES_PER_TICK", "5"))
    sim_autostart: bool = _bool("SIM_AUTOSTART", True)
    eval_seeds: int = int(os.getenv("AYU_EVAL_SEEDS", "5"))


settings = Settings()
