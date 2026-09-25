# AYU — Intelligent Early Health-Risk Detection & Decision Support

[![CI](https://github.com/Argonyx-26/T3-Nexora/actions/workflows/ci.yml/badge.svg)](https://github.com/Argonyx-26/T3-Nexora/actions/workflows/ci.yml)

**Team AYU · Argonyx'26, RV College** — Ishan Sharma (lead), Aryan Verma, Harshit Kandpal, Vinay

> Hospitals use NEWS2, which applies the same thresholds to everyone. AYU adds a **personal baseline** for each
> patient plus **trend detection**, so it catches deterioration hours earlier — and it explains every alert in plain language.

> ⚠️ **AYU is decision support, not diagnosis. Final clinical judgment rests with the doctor.**

## Quick start

```bash
./run.sh          # macOS / Linux  (Windows: run.bat)
```

- Dashboard: **http://localhost:5173**
- API: http://127.0.0.1:8000 — interactive docs at **http://127.0.0.1:8000/docs**
- First start creates `backend/.venv` (Python 3.11 via `uv` if installed), copies `.env.example` → `.env`, and seeds a
  demo database of 10 patients with 7 days of 5-minute vitals, and installs the frontend (Node 18+). Works fully offline;
  `GEMINI_API_KEY` is optional.

Run the tests:

```bash
cd backend && .venv/bin/pytest
```

Re-seed and print the cohort's current risk:

```bash
cd backend && .venv/bin/python -m app.seed.seed
```

## How the risk engine works

`backend/app/risk/` is pure Python — no database, no web framework — and every tunable number lives in
[`weights.py`](backend/app/risk/weights.py).

| # | Component | What it does |
|---|-----------|--------------|
| 1 | **NEWS2** | Official RCP chart (table below). Scale 2 SpO₂ for patients with a prescribed 88–92% target (COPD). |
| 2 | **qSOFA** | RR ≥ 22, SBP ≤ 100, altered mentation; ≥ 2 → sepsis-risk flag. |
| 3 | **Personal baseline** | Median and MAD-σ of the last 7 days, **excluding the last 6 h** so a slow decline can't teach itself "normal". Flags \|z\| ≥ 2.5 or ≥ 20% change, in the concerning direction only. |
| 4 | **Trend** | Least-squares slope over the last 3 h. Flagged when steep enough *and* ≥ 3 standard errors from zero, with the error widened for autocorrelation — so noise can't fake a trend. |
| 5 | **Medication** | 7-day adherence %, plus missed *critical* doses (insulin, antihypertensives, anticoagulants) in the last 24 h. |
| 6 | **Symptoms** | Weighted red flags; chest pain, one-sided weakness, slurred speech, fainting, new confusion, coughing blood escalate immediately. |
| 7 | **Score** | 0–100 → Stable (0–24) · Watch (25–49) · Warning (50–74) · Critical (75+). Each group is capped; escalation floors mean AYU is never *less* alarming than NEWS2. Every point is a named **contributing factor**, and they add up to the score. |

### NEWS2 chart

| Parameter | 3 | 2 | 1 | 0 | 1 | 2 | 3 |
|---|---|---|---|---|---|---|---|
| Resp. rate | ≤ 8 | | 9–11 | 12–20 | | 21–24 | ≥ 25 |
| SpO₂ scale 1 | ≤ 91 | 92–93 | 94–95 | ≥ 96 | | | |
| Air or oxygen | | Oxygen | | Air | | | |
| Temperature °C | ≤ 35.0 | | 35.1–36.0 | 36.1–38.0 | 38.1–39.0 | ≥ 39.1 | |
| Systolic BP | ≤ 90 | 91–100 | 101–110 | 111–219 | | | ≥ 220 |
| Heart rate | ≤ 40 | | 41–50 | 51–90 | 91–110 | 111–130 | ≥ 131 |
| Consciousness | | | | Alert | | | New confusion / V / P / U |

Bands: 0–4 Low (any single 3 → Low-Medium, urgent review) · 5–6 Medium · ≥ 7 High.

## Live demo (Phase 2)

The backend runs a live ward: every 2 s (1×) each patient gets a new reading = 5 simulated minutes, is re-scored,
and the result is pushed over **WebSocket `/ws/live`**. The dashboard updates in place; alerts arrive with a toast and a chime.

- **Demo control panel:** http://localhost:5173/demo — pick a patient, inject a scenario, set 1× / 5× / 20×, pause, reset.
- **Scenarios:** `sepsis`, `hypoxia`, `hypertensive_crisis`, `cardiac`, `missed_meds`, `recover`.
- **Alert rules:** an alert opens when a patient's level rises to Watch or above. A further rise escalates the *same*
  alert (no spam). The level drops only after 3 consecutive lower ticks, so a boundary score can't flap. After an alert is
  resolved, the same patient can't re-alert at the same level for 30 simulated minutes. States: new → acknowledged → resolved,
  with the doctor's note.

Measured on the seeded cohort (7 simulated hours, all scenarios running at once):

| Scenario | Patient | AYU Warning | NEWS2 escalation* | AYU earlier by |
|---|---|---|---|---|
| Sepsis | Arjun (post-op) | 2.1 h | 3.2 h | ~1.1 h |
| Sepsis | Vikram (runner, HR 52) | 1.8 h | 3.2 h | ~1.3 h |
| Hypoxia | Priya | 3.0 h | 3.7 h | ~40 min |
| Hypertensive crisis | Ramesh (usual SBP 150) | 2.2 h | 4.0 h | ~1.8 h |
| Missed insulin | Irfan (type 1) | 2.2 h | never | NEWS2 has no glucose |

\*NEWS2 escalation = total ≥ 5 or any single parameter scoring 3. One alert per deteriorating patient; zero alerts on the
four patients left at rest.

**Before going on stage:** open `/demo` and press **Reset** — a fresh 7-day history, no alerts, 1× speed.

## Explanations (Phase 4)

Every score comes with a plain-language explanation: 2–3 sentences for the doctor and one sentence for the patient,
in **English or हिंदी** (toggle on the patient page and in the patient portal).

- **Gemini** writes it when `GEMINI_API_KEY` is set in `.env` (model from `GEMINI_MODEL`). The system prompt forbids
  diagnosis, requires an urgency consistent with AYU's, and asks for JSON only.
- **Privacy boundary:** Gemini receives the score, level, urgency and contributing factors only — never a name, age,
  bed or ID (covered by a test).
- **Never blocks the demo:** each call is capped at `GEMINI_TIMEOUT_S` (4 s); a reply that isn't valid JSON (or isn't
  Devanagari when Hindi was asked for) is discarded; after any failure Gemini is skipped for 60 s. In every one of those
  cases AYU's built-in explanation answers instantly. The card shows which one you are reading.
- The built-in Hindi is generated from each factor's structured data (vital, value, baseline, slope, medicine,
  symptom), not machine-translated.

## Patient portal

`/patient` → pick a name. Plain-language status (from the live explanation), latest readings, today's medicines with
**Mark as taken**, **Log a reading** (°C or °F), and a **symptom checklist** in English or Hindi where red-flag symptoms
warn the patient to tell a nurse at once. **ASHA worker mode** records every entry with source `asha`, for village
health workers using a shared phone. Everything submitted re-scores the patient immediately and reaches the doctor's
dashboard live.

### API

| Method | Path | What |
|---|---|---|
| GET | `/patients`, `/patients/{id}` | Live list (highest risk first) and one patient |
| GET | `/patients/{id}/risk` | Full explainable assessment |
| GET | `/patients/{id}/vitals?range=6h` · `/risk/history` · `/medications` · `/symptoms` | History |
| GET | `/patients/{id}/explanation?lang=en\|hi` | Explanation for doctor and patient (Gemini or built-in) |
| POST | `/patients/{id}/vitals` | Log a reading by hand (patient / ASHA / staff); re-scored at once |
| POST | `/patients/{id}/symptoms` | Report symptoms; re-scored at once |
| POST | `/doses` | Mark a dose taken / missed |
| GET | `/alerts?status=open` | Alerts |
| POST | `/alerts/{id}/ack` · `/alerts/{id}/resolve` | With the doctor's note |
| GET/POST | `/sim`, `/sim/scenarios`, `/sim/scenario`, `/sim/speed`, `/sim/pause`, `/sim/resume`, `/sim/step`, `/sim/reset` | Demo controls |
| WS | `/ws/live` | Snapshot on connect, then every tick, alert and control change |

## Project layout

```
backend/app/
  risk/       the engine (weights.py, news2, qsofa, baseline, trend, adherence, symptoms, engine)
  explain/    explanations: built-in English/Hindi templates + Gemini with timeout and fallback
  seed/       demo cohort + vitals generator
  sim/        live simulator + scenarios (alerts, hysteresis, cooldown)
  services/   database ↔ engine glue, WebSocket hub
  api/        REST + WebSocket routers
  main.py     FastAPI app
backend/tests/  pytest suite
frontend/src/
  pages/        Landing, Doctor (ward), PatientDetail, PatientPortal, Demo
  components/   VitalField (hero canvas), HeroMonitor, charts, motion kit, UI
  lib/          API client, live WebSocket store, types, formatting, theme
```

## Status

- [x] Phase 1 — scaffold, models, seed data, risk engine, tests
- [x] Phase 2 — live simulator, WebSocket, alerts, scenarios, demo control panel
- [x] Frontend (built ahead of Phase 2) — dark premium UI: landing with live canvas hero and scroll story, ward
      dashboard, patient detail with baseline-banded charts, patient view in English/हिंदी
- [x] Phase 3 — live dashboard and patient detail over WebSocket, alerts panel with toasts and sound
- [x] Phase 4 — explanations (Gemini + offline fallback), Hindi, patient portal with ASHA mode
- [ ] Phase 5 — evaluation page, polish
