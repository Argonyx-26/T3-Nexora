"""Build the demo database: patients, 7 days of 5-minute vitals, medication schedules with
a realistic taken/missed history, a few old symptoms, and 24 h of risk snapshots.

Deterministic for a given AYU_SEED, so every rehearsal looks the same.
Run directly to (re)seed and print a risk table:  python -m app.seed.seed
"""

from __future__ import annotations

import bisect
import random
from datetime import datetime, time, timedelta, timezone

from sqlalchemy import insert
from sqlmodel import Session, select

from ..config import settings
from ..db import create_tables, drop_tables, engine
from ..models import DoseEvent, Medication, Patient, RiskSnapshot, SymptomReport, VitalReading
from ..risk import PatientContext, assess
from .patients import PATIENTS
from .physiology import IST, VitalGenerator

STEP = timedelta(minutes=settings.minutes_per_tick)
SNAPSHOT_EVERY = timedelta(minutes=30)
SNAPSHOT_HOURS = 24


def sim_start() -> datetime:
    """'Now' for the seeded world: current UTC floored to the tick, naive."""
    now = datetime.now(timezone.utc).replace(tzinfo=None, second=0, microsecond=0)
    minutes = settings.minutes_per_tick
    return now - timedelta(minutes=now.minute % minutes)


def ist_time_to_utc(day_ist: datetime, hhmm: str) -> datetime:
    h, m = (int(x) for x in hhmm.split(":"))
    return datetime.combine(day_ist.date(), time(h, m)) - IST


def seed_database(start: datetime | None = None, reset: bool = True) -> datetime:
    start = start or sim_start()
    rng = random.Random(settings.seed)
    if reset:
        drop_tables()
    create_tables()

    history_start = start - timedelta(days=settings.history_days)
    n_steps = int((start - history_start) / STEP)

    with Session(engine) as s:
        for p in PATIENTS:
            s.add(Patient(
                id=p["id"], name=p["name"], age=p["age"], sex=p["sex"], conditions=p["conditions"],
                ward=p["ward"], bed=p["bed"], language=p["language"], spo2_scale=p.get("spo2_scale", 1),
                normals={v: {"mean": m, "std": sd} for v, (m, sd) in p["normals"].items()},
                notes=p["notes"],
            ))
        s.commit()

        for p in PATIENTS:
            gen = VitalGenerator(p["normals"], random.Random(f"{settings.seed}-{p['id']}"))
            rows = []
            for i in range(n_steps + 1):
                ts = history_start + i * STEP
                rows.append({"patient_id": p["id"], "ts": ts, "on_oxygen": False, "consciousness": "A", "source": "seed", **gen.next(ts)})
            s.execute(insert(VitalReading), rows)

            for med in p["meds"]:
                m = Medication(patient_id=p["id"], name=med["name"], dose=med["dose"], purpose=med["purpose"],
                               times=med["times"], critical=med["critical"])
                s.add(m)
                s.flush()
                dose_rows = []
                first_day = (history_start + IST).replace(hour=0, minute=0)
                for day in range(settings.history_days + 2):
                    day_ist = first_day + timedelta(days=day)
                    for hhmm in med["times"]:
                        at = ist_time_to_utc(day_ist, hhmm)
                        if at < history_start:
                            continue
                        if at > start:
                            status, recorded = "pending", None
                        elif at > start - timedelta(hours=24):
                            status, recorded = "taken", at + timedelta(minutes=rng.randint(0, 25))  # a clean last day
                        elif rng.random() < p["adherence"]:
                            status, recorded = "taken", at + timedelta(minutes=rng.randint(0, 40))
                        else:
                            status, recorded = "missed", None
                        dose_rows.append({"medication_id": m.id, "patient_id": p["id"], "scheduled_at": at,
                                          "status": status, "recorded_at": recorded})
                if dose_rows:
                    s.execute(insert(DoseEvent), dose_rows)

            for hours_ago, key in p["history_symptoms"]:
                s.add(SymptomReport(patient_id=p["id"], ts=start - timedelta(hours=hours_ago), symptom=key, source="patient"))
        s.commit()

        _seed_snapshots(s, start)
        s.commit()
    return start


def _seed_snapshots(s: Session, start: datetime) -> None:
    """Risk every 30 min for the last 24 h, so the risk timeline isn't empty on first load."""
    from ..services.context import load_context

    for p in PATIENTS:
        full = load_context(s, p["id"])
        times = [r.ts for r in full.history]
        t = start - timedelta(hours=SNAPSHOT_HOURS)
        while t <= start:
            idx = bisect.bisect_right(times, t)
            ctx = PatientContext(patient_id=full.patient_id, history=full.history[:idx], declared_normals=full.declared_normals,
                                 doses=full.doses, symptoms=full.symptoms, spo2_scale=full.spo2_scale)
            r = assess(ctx)
            s.add(RiskSnapshot(patient_id=p["id"], ts=ctx.now, score=r.score, level=r.level, news2=r.news2.total, qsofa=r.qsofa.score))
            t += SNAPSHOT_EVERY


def main() -> None:
    import time as _time

    from ..services.context import load_context

    t0 = _time.perf_counter()
    start = seed_database()
    print(f"Seeded {len(PATIENTS)} patients, {settings.history_days} days of history ending {start:%Y-%m-%d %H:%M} UTC "
          f"in {_time.perf_counter() - t0:.1f}s\n")
    print(f"{'ID':5} {'Patient':18} {'Score':>5}  {'Level':9} {'NEWS2':>5}  Why")
    with Session(engine) as s:
        for p in s.exec(select(Patient)).all():
            r = assess(load_context(s, p.id))
            print(f"{p.id:5} {p.name:18} {r.score:5d}  {r.level:9} {r.news2.total:5d}  {r.summary}")


if __name__ == "__main__":
    main()
