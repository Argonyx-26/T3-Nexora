# AYU — Intelligent Early Health-Risk Detection & Decision Support

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

## Project layout

```
backend/app/
  risk/       the engine (weights.py, news2, qsofa, baseline, trend, adherence, symptoms, engine)
  seed/       demo cohort + vitals generator
  services/   database ↔ engine glue
  api/        REST routers
  main.py     FastAPI app
backend/tests/  pytest suite
frontend/src/
  pages/        Landing, Doctor (ward), PatientDetail, PatientPortal
  components/   VitalField (hero canvas), HeroMonitor, charts, motion kit, UI
  lib/          API client, types, formatting, theme
```

## Status

- [x] Phase 1 — scaffold, models, seed data, risk engine, tests
- [ ] Phase 2 — live simulator, WebSocket, alerts, scenarios
- [x] Frontend (built ahead of Phase 2) — dark premium UI: landing with live canvas hero and scroll story, ward
      dashboard, patient detail with baseline-banded charts, patient view in English/हिंदी
- [ ] Phase 3 — live updates over WebSocket on the dashboard and patient detail
- [ ] Phase 4 — explanations (Gemini + offline fallback), Hindi, patient portal
- [ ] Phase 5 — evaluation page, demo panel, polish
