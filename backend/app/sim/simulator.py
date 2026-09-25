"""The live ward: streams vitals for every patient, re-scores risk on each tick, raises
alerts, and runs injected scenarios.

One tick = SIM_MINUTES_PER_TICK simulated minutes, every SIM_TICK_SECONDS / speed real
seconds. State lives in memory (fast reads for the API and WebSocket) and every reading,
risk snapshot, dose and alert is also written to SQLite.

Alert rules
- The *held* level rises the moment the risk level rises, but only drops after the risk
  has stayed lower for DROP_AFTER_TICKS ticks, so a score hovering on a boundary can't flap.
- A rise to Watch or above opens an alert. While an alert is open (new or acknowledged)
  a further rise escalates that same alert and marks it new again; it never spams a second one.
- After an alert is resolved, the same patient can't raise another at the same or a lower
  level for ALERT_COOLDOWN.
"""

from __future__ import annotations

import asyncio
import logging
import random
import threading
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import func, insert
from sqlmodel import Session, col, select

from ..config import settings
from ..db import engine
from ..models import Alert, DoseEvent, Medication, Patient, RiskSnapshot, SymptomReport, VitalReading
from ..risk import Dose, PatientContext, Reading, RiskResult, SymptomEntry, assess
from ..risk import weights as W
from ..risk.baseline import all_baselines
from ..schemas import AlertOut, FactorOut, LiveRisk, LiveUpdate, SimState, VitalOut
from ..seed.physiology import VitalGenerator
from ..services.hub import hub
from ..services.serialize import risk_brief
from .scenarios import RECOVER_KEY, SCENARIOS, recover_offsets

log = logging.getLogger("ayu.sim")

RANK = {"Stable": 0, "Watch": 1, "Warning": 2, "Critical": 3}
DROP_AFTER_TICKS = 3
ALERT_COOLDOWN = timedelta(minutes=30)
BASELINE_REFRESH_TICKS = 12  # re-learn baselines every simulated hour
HISTORY_KEEP = timedelta(hours=W.BASELINE_WINDOW_HOURS + 1)
RECOVER_DONE_H = 3.0
SPEEDS = (1, 5, 20)
MISSED_LOOKBACK = timedelta(hours=12)


@dataclass
class DoseRec:
    id: int
    medication: str
    critical: bool
    scheduled_at: datetime
    status: str


@dataclass
class SymRec:
    id: int
    ts: datetime
    key: str


@dataclass
class ActiveScenario:
    key: str
    started_at: datetime
    fired: set[int] = field(default_factory=set)
    start_offsets: dict[str, float] = field(default_factory=dict)  # recover eases these back to 0


@dataclass
class PState:
    info: dict
    normals: dict[str, tuple[float, float]]
    gen: VitalGenerator
    history: deque
    doses: list[DoseRec]
    symptoms: list[SymRec]
    baselines: dict | None = None
    baseline_age: int = 0
    scenario: ActiveScenario | None = None
    consciousness: str = "A"
    on_oxygen: bool = False
    skip_critical: bool = False
    risk: RiskResult | None = None
    held: str = "Stable"
    below: int = 0
    open_alert_id: int | None = None
    last_alert_at: datetime | None = None
    last_alert_level: str = "Stable"

    @property
    def id(self) -> str:
        return self.info["id"]


def alert_out(a: Alert, info: dict) -> AlertOut:
    return AlertOut(
        id=a.id, patient_id=a.patient_id, patient_name=info["name"], bed=info["bed"],
        created_at=a.created_at, updated_at=a.updated_at, level=a.level, prev_level=a.prev_level,
        score=a.score, title=a.title, summary=a.summary, factors=[FactorOut(**f) for f in a.factors],
        status=a.status, acknowledged_at=a.acknowledged_at, resolved_at=a.resolved_at,
        note=a.note, acknowledged_by=a.acknowledged_by, disclaimer=W.DISCLAIMER,
    )


class Simulator:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.states: dict[str, PState] = {}
        self.now: datetime | None = None
        self.speed = 1
        self.paused = False
        self.loaded = False
        self.ticks = 0
        self._task: asyncio.Task | None = None

    # ---------------------------------------------------------------- loading

    def load(self) -> None:
        with self.lock, Session(engine) as s:
            self.states = {}
            self.now = s.exec(select(func.max(VitalReading.ts))).one()
            if self.now is None:
                raise RuntimeError("No readings in the database; seed it first")
            since = self.now - HISTORY_KEEP
            for p in s.exec(select(Patient).order_by(col(Patient.id))).all():
                normals = {k: (float(v["mean"]), float(v["std"])) for k, v in p.normals.items()}
                rows = s.exec(
                    select(VitalReading)
                    .where(VitalReading.patient_id == p.id, VitalReading.ts >= since)
                    .order_by(col(VitalReading.ts))
                ).all()
                history = deque(
                    Reading(ts=r.ts, hr=r.hr, spo2=r.spo2, sbp=r.sbp, dbp=r.dbp, rr=r.rr, temp=r.temp,
                            glucose=r.glucose, on_oxygen=r.on_oxygen, consciousness=r.consciousness)
                    for r in rows
                )
                doses = [
                    DoseRec(id=d.id, medication=m.name, critical=m.critical, scheduled_at=d.scheduled_at, status=d.status)
                    for d, m in s.exec(
                        select(DoseEvent, Medication)
                        .join(Medication, col(DoseEvent.medication_id) == col(Medication.id))
                        .where(DoseEvent.patient_id == p.id, DoseEvent.scheduled_at >= self.now - timedelta(days=8))
                        .order_by(col(DoseEvent.scheduled_at))
                    ).all()
                ]
                symptoms = [
                    SymRec(id=x.id, ts=x.ts, key=x.symptom)
                    for x in s.exec(
                        select(SymptomReport).where(
                            SymptomReport.patient_id == p.id,
                            SymptomReport.resolved_at == None,  # noqa: E711
                            SymptomReport.ts >= self.now - timedelta(days=1),
                        )
                    ).all()
                ]
                ps = PState(
                    info=p.model_dump(), normals=normals,
                    gen=VitalGenerator(normals, random.Random(f"{settings.seed}-live-{p.id}")),
                    history=history, doses=doses, symptoms=symptoms,
                )
                last = history[-1] if history else None
                if last:
                    ps.consciousness, ps.on_oxygen = last.consciousness, last.on_oxygen
                ps.baselines = all_baselines(list(history), self.now, normals)
                open_alert = s.exec(
                    select(Alert).where(Alert.patient_id == p.id, Alert.status != "resolved").order_by(col(Alert.created_at).desc())
                ).first()
                if open_alert:
                    ps.open_alert_id = open_alert.id
                last_alert = s.exec(select(Alert).where(Alert.patient_id == p.id).order_by(col(Alert.created_at).desc())).first()
                if last_alert:
                    ps.last_alert_at, ps.last_alert_level = last_alert.created_at, last_alert.level
                ps.risk = assess(self._ctx(ps))
                ps.held = ps.risk.level
                self.states[p.id] = ps
            self.ticks = 0
            self.loaded = True
        log.info("simulator loaded %d patients at %s", len(self.states), self.now)

    def ensure_loaded(self) -> None:
        if not self.loaded:
            self.load()

    # ---------------------------------------------------------------- engine glue

    def _ctx(self, ps: PState) -> PatientContext:
        now = self.now
        return PatientContext(
            patient_id=ps.id,
            history=list(ps.history),
            declared_normals=ps.normals,
            doses=[Dose(d.medication, d.scheduled_at, d.status, d.critical) for d in ps.doses
                   if now - timedelta(days=W.ADHERENCE_WINDOW_DAYS) <= d.scheduled_at <= now],
            symptoms=[SymptomEntry(x.ts, x.key) for x in ps.symptoms if x.ts <= now],
            spo2_scale=ps.info["spo2_scale"],
            baselines=ps.baselines,
        )

    def _offsets(self, ps: PState) -> tuple[dict[str, float], dict[str, float]]:
        sc = ps.scenario
        if sc is None:
            return {}, {}
        hours = (self.now - sc.started_at).total_seconds() / 3600
        if sc.key == RECOVER_KEY:
            return recover_offsets(sc.start_offsets, hours), {}
        spec = SCENARIOS[sc.key]
        return spec.offsets(hours), spec.extra_noise

    # ---------------------------------------------------------------- one tick

    def step(self) -> dict:
        """Advance the ward by one tick. Returns the WebSocket message for it."""
        with self.lock:
            self.ensure_loaded()
            self.now += timedelta(minutes=settings.minutes_per_tick)
            self.ticks += 1
            updates, new_alerts, changed = [], [], []
            vital_rows, snapshot_rows = [], []
            with Session(engine) as s:
                for ps in self.states.values():
                    self._run_scenario(ps, s)
                    self._take_due_doses(ps, s)
                    offsets, noise = self._offsets(ps)
                    values = ps.gen.next(self.now, offsets, noise)
                    reading = Reading(ts=self.now, on_oxygen=ps.on_oxygen, consciousness=ps.consciousness, **values)
                    ps.history.append(reading)
                    while ps.history and ps.history[0].ts < self.now - HISTORY_KEEP:
                        ps.history.popleft()
                    vital_rows.append({"patient_id": ps.id, "ts": self.now, "on_oxygen": ps.on_oxygen,
                                       "consciousness": ps.consciousness, "source": "sim", **values})
                    ps.baseline_age += 1
                    if ps.baseline_age >= BASELINE_REFRESH_TICKS:
                        ps.baselines = all_baselines(list(ps.history), self.now, ps.normals)
                        ps.baseline_age = 0
                    ps.risk = assess(self._ctx(ps))
                    snapshot_rows.append({"patient_id": ps.id, "ts": self.now, "score": ps.risk.score,
                                          "level": ps.risk.level, "news2": ps.risk.news2.total, "qsofa": ps.risk.qsofa.score})
                    for kind, alert in self._alert_rules(ps, s):
                        (new_alerts if kind == "new" else changed).append(alert_out(alert, ps.info).model_dump(mode="json"))
                    updates.append(self._update(ps).model_dump(mode="json"))
                s.execute(insert(VitalReading), vital_rows)
                s.execute(insert(RiskSnapshot), snapshot_rows)
                s.commit()
            return {"type": "tick", "sim": self.state().model_dump(mode="json"), "updates": updates,
                    "new_alerts": new_alerts, "alert_updates": changed}

    def _run_scenario(self, ps: PState, s: Session) -> None:
        sc = ps.scenario
        if sc is None:
            return
        hours = (self.now - sc.started_at).total_seconds() / 3600
        if sc.key == RECOVER_KEY:
            if hours >= RECOVER_DONE_H:
                ps.scenario = None
            return
        for i, ev in enumerate(SCENARIOS[sc.key].events):
            if i in sc.fired or hours < ev.at_h:
                continue
            sc.fired.add(i)
            if ev.kind == "symptom":
                self._add_symptoms(ps, s, [ev.value], source="sim", note=f"{SCENARIOS[sc.key].label} scenario")
            elif ev.kind == "consciousness":
                ps.consciousness = ev.value
            elif ev.kind == "missed_doses":
                ps.skip_critical = True
                for d in ps.doses:
                    if d.critical and self.now - MISSED_LOOKBACK <= d.scheduled_at <= self.now and d.status != "missed":
                        d.status = "missed"
                        row = s.get(DoseEvent, d.id)
                        if row:
                            row.status, row.recorded_at = "missed", None

    def _take_due_doses(self, ps: PState, s: Session) -> None:
        for d in ps.doses:
            if d.status == "pending" and d.scheduled_at <= self.now:
                d.status = "missed" if (ps.skip_critical and d.critical) else "taken"
                row = s.get(DoseEvent, d.id)
                if row:
                    row.status = d.status
                    row.recorded_at = self.now if d.status == "taken" else None

    def _add_symptoms(self, ps: PState, s: Session, keys: list[str], source: str, note: str = "") -> None:
        for key in keys:
            row = SymptomReport(patient_id=ps.id, ts=self.now, symptom=key, source=source, note=note)
            s.add(row)
            s.flush()
            ps.symptoms.append(SymRec(id=row.id, ts=self.now, key=key))

    def _alert_rules(self, ps: PState, s: Session) -> list[tuple[str, Alert]]:
        risk = ps.risk
        level = risk.level
        before = ps.held
        rose = False
        if RANK[level] > RANK[ps.held]:
            ps.held, ps.below, rose = level, 0, True
        elif RANK[level] < RANK[ps.held]:
            ps.below += 1
            if ps.below >= DROP_AFTER_TICKS:
                ps.held, ps.below = level, 0
        else:
            ps.below = 0
        if not rose or ps.held == "Stable":
            return []

        factors = [f.to_dict() for f in risk.factors[:5]]
        title = f"{ps.info['name']} rose to {ps.held}"
        current = s.get(Alert, ps.open_alert_id) if ps.open_alert_id else None
        if current and current.status != "resolved":
            if RANK[ps.held] <= RANK[current.level]:
                return []
            current.prev_level, current.level = current.level, ps.held
            current.score, current.title, current.summary = risk.score, title, risk.summary
            current.factors, current.status, current.updated_at = factors, "new", self.now
            s.add(current)
            s.flush()
            return [("escalated", current)]
        if (ps.last_alert_at and self.now - ps.last_alert_at < ALERT_COOLDOWN
                and RANK[ps.held] <= RANK[ps.last_alert_level]):
            return []
        alert = Alert(patient_id=ps.id, created_at=self.now, level=ps.held, prev_level=before, score=risk.score,
                      title=title, summary=risk.summary, factors=factors, status="new")
        s.add(alert)
        s.flush()
        ps.open_alert_id, ps.last_alert_at, ps.last_alert_level = alert.id, self.now, ps.held
        return [("new", alert)]

    # ---------------------------------------------------------------- views

    def _update(self, ps: PState) -> LiveUpdate:
        r = ps.risk
        last = ps.history[-1]
        vitals = VitalOut(ts=last.ts, hr=last.hr, spo2=last.spo2, sbp=last.sbp, dbp=last.dbp, rr=last.rr, temp=last.temp,
                          glucose=last.glucose, on_oxygen=last.on_oxygen, consciousness=last.consciousness,
                          source="sim")
        brief = risk_brief(r)
        return LiveUpdate(
            patient_id=ps.id, vitals=vitals,
            risk=LiveRisk(**brief.model_dump(), alert_level=ps.held, qsofa_flag=r.qsofa.flag,
                          top_factors=[f.headline for f in r.factors[:3]]),
            scenario=ps.scenario.key if ps.scenario else None,
        )

    def state(self) -> SimState:
        return SimState(
            sim_time=self.now, speed=self.speed, paused=self.paused,
            running=self._task is not None and not self._task.done(),
            tick_seconds=settings.tick_seconds, minutes_per_tick=settings.minutes_per_tick,
            scenarios={pid: ps.scenario.key for pid, ps in self.states.items() if ps.scenario},
        )

    def snapshot(self) -> dict:
        with self.lock:
            self.ensure_loaded()
            with Session(engine) as s:
                alerts = s.exec(select(Alert).where(Alert.status != "resolved").order_by(col(Alert.created_at).desc())).all()
                alert_list = [alert_out(a, self.states[a.patient_id].info).model_dump(mode="json") for a in alerts if a.patient_id in self.states]
            return {"type": "snapshot", "sim": self.state().model_dump(mode="json"),
                    "updates": [self._update(ps).model_dump(mode="json") for ps in self.states.values()],
                    "alerts": alert_list}

    def get(self, patient_id: str) -> PState | None:
        self.ensure_loaded()
        return self.states.get(patient_id)

    # ---------------------------------------------------------------- controls

    def start_scenario(self, patient_id: str, key: str) -> dict:
        with self.lock:
            ps = self.states[patient_id]
            if key == RECOVER_KEY:
                offsets, _ = self._offsets(ps)
                ps.scenario = ActiveScenario(key=key, started_at=self.now, start_offsets=offsets)
                ps.consciousness, ps.on_oxygen, ps.skip_critical = "A", False, False
                with Session(engine) as s:
                    for x in ps.symptoms:
                        row = s.get(SymptomReport, x.id)
                        if row:
                            row.resolved_at = self.now
                    s.commit()
                ps.symptoms = []
            else:
                ps.scenario = ActiveScenario(key=key, started_at=self.now)
                ps.consciousness, ps.skip_critical = "A", False
            return self.reassess(patient_id)

    def reassess(self, patient_id: str) -> dict:
        """Re-score one patient now (after a symptom, dose or scenario change) without a new reading."""
        with self.lock, Session(engine) as s:
            ps = self.states[patient_id]
            ps.risk = assess(self._ctx(ps))
            new_alerts, changed = [], []
            for kind, alert in self._alert_rules(ps, s):
                (new_alerts if kind == "new" else changed).append(alert_out(alert, ps.info).model_dump(mode="json"))
            s.commit()
            return {"type": "update", "sim": self.state().model_dump(mode="json"),
                    "updates": [self._update(ps).model_dump(mode="json")], "new_alerts": new_alerts, "alert_updates": changed}

    def report_symptoms(self, patient_id: str, keys: list[str], source: str, note: str) -> dict:
        with self.lock:
            ps = self.states[patient_id]
            with Session(engine) as s:
                self._add_symptoms(ps, s, keys, source=source, note=note)
                s.commit()
            return self.reassess(patient_id)

    def record_dose(self, dose_id: int, status: str) -> dict | None:
        with self.lock:
            for ps in self.states.values():
                for d in ps.doses:
                    if d.id == dose_id:
                        d.status = status
                        with Session(engine) as s:
                            row = s.get(DoseEvent, dose_id)
                            row.status = status
                            row.recorded_at = self.now if status == "taken" else None
                            s.commit()
                        return self.reassess(ps.id)
            return None

    def alert_changed(self, alert: Alert) -> dict:
        with self.lock:
            ps = self.states.get(alert.patient_id)
            if ps and alert.status == "resolved" and ps.open_alert_id == alert.id:
                ps.open_alert_id = None
            info = ps.info if ps else {"name": alert.patient_id, "bed": ""}
            return {"type": "alert", "sim": self.state().model_dump(mode="json"),
                    "alert_updates": [alert_out(alert, info).model_dump(mode="json")]}

    def reset(self) -> None:
        from ..seed.seed import seed_database

        with self.lock:
            seed_database()
            self.load()
            self.speed = 1
            self.paused = False

    # ---------------------------------------------------------------- loop

    async def run(self) -> None:
        loop = asyncio.get_running_loop()
        while True:
            started = loop.time()
            if not self.paused:
                try:
                    message = await asyncio.to_thread(self.step)
                    await hub.broadcast(message)
                except Exception:  # the ward keeps running whatever one tick does
                    log.exception("simulator tick failed")
            interval = settings.tick_seconds / max(1, self.speed)
            await asyncio.sleep(max(0.02, interval - (loop.time() - started)))

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self.run(), name="ayu-simulator")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None


sim = Simulator()
