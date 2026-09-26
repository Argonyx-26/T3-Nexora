import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Activity, ChartSpline, ClipboardList, History, LayoutGrid, ListChecks, Microscope, NotebookPen, Pill, ShieldPlus, Siren, Stethoscope, Target, TrendingUp, type LucideIcon } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertCard, AlertToaster, LiveStatus } from "../components/alerts";
import { ExplanationCard } from "../components/ExplanationCard";
import { VITAL_ICON, ic } from "../components/icons";
import { BeatingHeart, PulseStrip } from "../components/PageArt";
import { CareLine } from "../components/NetworkKit";
import { DoctorTimeline, HistoryCard, InsightStrip, MedicationCalendar, MentalHealthCard, NotesAndCare, RecentChanges, TREND_RANGES, TrendExplorer, type TrendRange } from "../components/DoctorKit";
import { Shell } from "../components/Shell";
import { VitalChart } from "../components/VitalChart";
import { Card, EmptyState, ErrorState, Eyebrow, RiskBadge, Skeleton, cx } from "../components/ui";
import { api, useQuery } from "../lib/api";
import { useLive } from "../lib/live";
import { DISCLAIMER, LEVEL_STYLE, VITALS, fmtTime, fmtVital } from "../lib/format";
import type { Factor, Level, Risk, VitalKey } from "../lib/types";

const RANGES = TREND_RANGES;

/** Run `fn` when `value` changes, at most once per `minMs` (trailing call guaranteed). */
function useThrottledOnChange(value: unknown, minMs: number, fn: () => void) {
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const first = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (value === undefined) return;
    if (first.current) {
      first.current = false;
      return;
    }
    clearTimeout(timer.current);
    const fire = () => {
      last.current = Date.now();
      fnRef.current();
    };
    const wait = last.current + minMs - Date.now();
    if (wait <= 0) fire();
    else timer.current = setTimeout(fire, wait);
  }, [value, minMs]);
  useEffect(() => () => clearTimeout(timer.current), []);
}
const EASE = [0.22, 1, 0.36, 1] as const;

const TABS = [
  { key: "overview", label: "Overview", icon: LayoutGrid },
  { key: "trends", label: "Trends", icon: ChartSpline },
  { key: "meds", label: "Medications", icon: Pill },
  { key: "timeline", label: "Timeline", icon: History },
  { key: "notes", label: "Notes & care", icon: NotebookPen },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function PatientDetail() {
  const { id = "" } = useParams();
  const [range, setRange] = useState<TrendRange>("24h");
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((x) => x.key === params.get("tab")) ? params.get("tab") : "overview") as TabKey;
  const setTab = (k: TabKey) => setParams((prev) => { const n = new URLSearchParams(prev); n.set("tab", k); return n; }, { replace: true });
  const insights = useQuery((s) => api.insights(id, s), [id], 30_000);
  const patient = useQuery((s) => api.patient(id, s), [id], 30_000);
  const risk = useQuery((s) => api.risk(id, s), [id], 30_000);
  const vitals = useQuery((s) => api.vitals(id, range, 500, s), [id, range], 60_000);
  const history = useQuery((s) => api.riskHistory(id, "24h", s), [id], 60_000);
  const meds = useQuery((s) => api.medications(id, s), [id], 60_000);
  const symptoms = useQuery((s) => api.symptoms(id, s), [id], 60_000);

  // Every live tick for this patient refreshes the screen (throttled so 20× speed stays smooth).
  const live = useLive();
  const tick = live.patients[id]?.vitals.ts;
  const openAlert = live.alerts.find((a) => a.patient_id === id);
  useThrottledOnChange(tick, 1500, () => {
    patient.reload();
    risk.reload();
    vitals.reload();
  });
  useThrottledOnChange(tick, 6000, () => {
    insights.reload();
    history.reload();
    meds.reload();
    symptoms.reload();
  });

  if (patient.error && !patient.data) {
    return (
      <Shell>
        <div className="mx-auto max-w-xl px-4 py-24">
          <ErrorState error={patient.error} onRetry={patient.reload} />
          <div className="mt-6 text-center"><Link to="/doctor" className="text-[14px] text-muted hover:text-ink">← Back to the ward</Link></div>
        </div>
      </Shell>
    );
  }

  const p = patient.data;
  const r = risk.data;
  const level: Level = r?.level ?? "Stable";
  const hr = live.patients[id]?.vitals.hr ?? p?.latest.hr;

  return (
    <Shell status={<LiveStatus />}>
      <AlertToaster />
      <div className="mx-auto max-w-[1400px] px-4 pt-8 pb-20 sm:px-8">
        <Link to="/doctor" className="group inline-flex items-center gap-2 text-[13px] text-muted hover:text-ink">
          <span className="transition-transform group-hover:-translate-x-0.5">←</span> Ward
        </Link>

        {/* Header, over a slow ECG strip in the patient's level colour, at their heart rate */}
        <div className="relative mt-6 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <PulseStrip bpm={hr} color={LEVEL_STYLE[level].hex} className="absolute inset-x-0 -bottom-11 -z-10 h-10 w-full opacity-30" />
          <div>
            {p ? (
              <>
                <Eyebrow>{p.ward} · Bed {p.bed} · {p.id}</Eyebrow>
                <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }} className="mt-3 font-display text-[clamp(44px,5.4vw,80px)] leading-[0.98] tracking-[-0.02em]">
                  {p.name}
                </motion.h1>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[14px] text-ink-2">
                  <span>{p.age} years · {p.sex === "M" ? "Male" : "Female"}</span>
                  {p.conditions.map((c) => <span key={c} className="rounded-full bg-surface-2 px-3 py-0.5 text-[12px]">{c}</span>)}
                  {p.spo2_scale === 2 && <span className="rounded-full bg-teal-soft px-3 py-0.5 text-[12px] text-teal">NEWS2 SpO₂ scale 2</span>}
                </div>
                {p.notes && <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-muted">{p.notes}</p>}
                <CareLine patient={p} onChanged={() => patient.reload()} />
              </>
            ) : (
              <div className="space-y-3"><Skeleton className="h-4 w-48" /><Skeleton className="h-16 w-96 max-w-full" /><Skeleton className="h-6 w-72" /></div>
            )}
          </div>
          {r ? (
            <div className="flex items-end gap-6">
              <div>
                <div className="eyebrow">AYU score</div>
                <motion.div key={r.score} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cx("font-display text-[96px] leading-[0.85]", LEVEL_STYLE[level].text)}>
                  {r.score}
                </motion.div>
              </div>
              <div className="space-y-2 pb-1">
                <div className="flex items-center gap-2">
                  <RiskBadge level={level} />
                  {hr != null && (
                    <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-ink-2 tnum" title="Beating at the patient's live heart rate">
                      <BeatingHeart bpm={hr} size={18} />
                      {Math.round(hr)}
                    </span>
                  )}
                </div>
                <div className="font-mono text-[12px] text-muted tnum">NEWS2 {r.news2.total} · {r.news2.band}</div>
                <div className="font-mono text-[12px] text-muted tnum">qSOFA {r.qsofa.score}/3</div>
              </div>
            </div>
          ) : (
            <Skeleton className="h-24 w-64" />
          )}
        </div>

        {openAlert && (
          <div className="mt-8 max-w-xl">
            <AlertCard alert={openAlert} />
          </div>
        )}

        <div className="mt-6">
          <InsightStrip ins={insights.data} risk={r} />
        </div>

        {/* Profile tabs */}
        <nav className="sticky top-16 z-20 -mx-4 mt-6 overflow-x-auto border-b border-line bg-bg/85 px-4 backdrop-blur-xl sm:-mx-8 sm:px-8" aria-label="Patient profile">
          <div className="flex min-w-max gap-1">
            {TABS.map((tb) => (
              <button key={tb.key} type="button" onClick={() => setTab(tb.key)} aria-current={tab === tb.key ? "page" : undefined}
                className={cx("relative inline-flex h-12 items-center gap-2 px-3.5 text-[14px] transition-colors", tab === tb.key ? "text-ink" : "text-muted hover:text-ink")}>
                <tb.icon {...ic(15)} />{tb.label}
                {tb.key === "meds" && (insights.data?.missed_patterns.length ?? 0) > 0 && <span className="size-1.5 rounded-full bg-watch" />}
                {tab === tb.key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-teal" />}
              </button>
            ))}
          </div>
        </nav>

        {tab === "overview" && (
          <motion.div key="overview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        {/* Action + why */}
        <div className="mt-6 grid gap-4 lg:grid-cols-[380px_1fr] [&>*]:min-w-0">
          <ActionCard risk={r} />
          <FactorsCard risk={r} />
        </div>

        <div className="mt-4">
          <ExplanationCard patientId={id} level={r?.level} score={r?.score} />
        </div>


            <div className="mt-4 grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
              <RecentChanges ins={insights.data} risk={r} />
              <MentalHealthCard ins={insights.data} />
              <HistoryCard p={p} />
            </div>
        {/* Risk timeline + NEWS2 */}
        <section className="mt-4 grid gap-4 lg:grid-cols-[1fr_380px] [&>*]:min-w-0">
          <Card className="p-6">
            <Eyebrow icon={History}>Risk timeline · 24 h</Eyebrow>
            <div className="mt-4">
              {history.error && !history.data ? (
                <ErrorState error={history.error} onRetry={history.reload} />
              ) : !history.data ? (
                <Skeleton className="h-[220px]" />
              ) : history.data.length < 2 ? (
                <EmptyState title="Not enough history yet" />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={history.data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                    <ReferenceArea y1={0} y2={25} fill="var(--stable)" fillOpacity={0.05} />
                    <ReferenceArea y1={25} y2={50} fill="var(--watch)" fillOpacity={0.06} />
                    <ReferenceArea y1={50} y2={75} fill="var(--warning)" fillOpacity={0.07} />
                    <ReferenceArea y1={75} y2={100} fill="var(--critical)" fillOpacity={0.08} />
                    <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                    <XAxis dataKey="ts" tickFormatter={fmtTime} tick={{ fontSize: 10, fill: "var(--muted)", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} minTickGap={48} />
                    <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 10, fill: "var(--muted)", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-2)", borderRadius: 12, fontSize: 12, fontFamily: "var(--font-mono)" }}
                      labelFormatter={(l) => fmtTime(String(l))}
                      formatter={(v, _n, item) => [`${v} · ${(item.payload as { level: string }).level}`, "AYU"]}
                    />
                    <Area dataKey="score" type="monotone" stroke="var(--teal)" strokeWidth={2} fill="var(--teal)" fillOpacity={0.08} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
          <News2Card risk={r} />
        </section>


            <div className="mt-4">
          <Card className="p-6">
            <Eyebrow icon={ClipboardList}>Symptom log · 7 days</Eyebrow>
            <div className="mt-4">
              {symptoms.error && !symptoms.data ? (
                <ErrorState error={symptoms.error} onRetry={symptoms.reload} />
              ) : !symptoms.data ? (
                <Skeleton className="h-24" />
              ) : symptoms.data.length === 0 ? (
                <EmptyState title="None reported">Symptoms logged by the patient or an ASHA worker appear here.</EmptyState>
              ) : (
                <ul className="space-y-2">
                  {symptoms.data.slice(0, 8).map((x) => {
                    const active = !x.resolved_at && r?.active_symptoms.includes(x.symptom);
                    return (
                      <li key={x.id} className={cx("rounded-xl px-4 py-2.5", active ? (x.red_flag ? "bg-critical-soft" : "bg-watch-soft") : "bg-surface-2")}>
                        <div className="flex items-baseline justify-between gap-3 text-[14px]">
                          <span className={cx(active && x.red_flag && "text-critical", active && "font-medium")}>{x.label_en}</span>
                          <span className="text-[12px] text-muted">{x.label_hi}</span>
                        </div>
                        <div className="mt-0.5 font-mono text-[10px] text-muted">
                          {fmtTime(x.ts)} · {x.source}
                          {x.red_flag && " · red flag"}
                          {x.resolved_at ? " · resolved" : active ? " · active" : ""}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>
            </div>
          </motion.div>
        )}

        {tab === "trends" && (
          <motion.div key="trends" className="mt-6" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            <TrendExplorer data={vitals.data} risk={r} range={range} setRange={setRange} />
        {/* Vitals */}
        <section className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow icon={Activity}>Vitals</Eyebrow>
              <h2 className="mt-2 font-display text-[36px] leading-none">Against this patient's own normal</h2>
              <p className="mt-2 text-[13px] text-muted">Shaded band: this patient's baseline ± 2.5σ. Dashed lines: where NEWS2 starts adding points.</p>
            </div>
            <div className="flex gap-1 rounded-full border border-line p-1">
              {RANGES.map((rg) => (
                <button key={rg} type="button" onClick={() => setRange(rg)} className={cx("h-8 rounded-full px-4 font-mono text-[12px] transition-colors duration-200", range === rg ? "bg-ink text-bg" : "text-muted hover:text-ink")}>
                  {rg}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
            {(["hr", "spo2", "sbp", "rr", "temp", "glucose"] as VitalKey[]).map((k) => (
              <VitalPanel key={k} vital={k} risk={r} loading={!vitals.data} error={vitals.error}>
                {vitals.data && (
                  <VitalChart
                    vital={k}
                    data={vitals.data}
                    baseline={r?.baselines[k]}
                    spo2Scale={p?.spo2_scale}
                    second={k === "sbp" ? { key: "dbp", baseline: r?.baselines.dbp } : undefined}
                  />
                )}
              </VitalPanel>
            ))}
          </div>
        </section>

          </motion.div>
        )}

        {tab === "meds" && (
          <motion.div key="meds" className="mt-6" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            <MedicationCalendar meds={meds.data} ins={insights.data} risk={r} now={p?.latest.ts} />
          </motion.div>
        )}

        {tab === "timeline" && (
          <motion.div key="timeline" className="mt-6" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            <DoctorTimeline patientId={id} p={p} />
          </motion.div>
        )}

        {tab === "notes" && (
          <motion.div key="notes" className="mt-6" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            <NotesAndCare patientId={id} />
          </motion.div>
        )}
      </div>
    </Shell>
  );
}

function ActionCard({ risk }: { risk?: Risk }) {
  if (!risk) return <Skeleton className="h-[260px] rounded-3xl" />;
  const s = LEVEL_STYLE[risk.level];
  return (
    <div className={cx("flex flex-col rounded-3xl p-6", s.soft)}>
      <div className={cx("eyebrow flex items-center gap-2", s.text)}><Stethoscope {...ic(13)} />Recommended action</div>
      <div className={cx("mt-3 font-display text-[40px] leading-none", s.text)}>{risk.urgency}</div>
      <ul className="mt-5 space-y-2.5 text-[14px] leading-snug text-ink">
        {risk.recommended_action.map((a) => (
          <li key={a} className="flex gap-3">
            <span className={cx("mt-[7px] size-1.5 shrink-0 rounded-full", s.dot)} />
            {a}
          </li>
        ))}
      </ul>
      <p className="mt-auto pt-6 text-[11px] leading-relaxed text-ink-2">{DISCLAIMER}</p>
    </div>
  );
}

function FactorsCard({ risk }: { risk?: Risk }) {
  if (!risk) return <Skeleton className="h-[260px] rounded-3xl" />;
  const factors = risk.factors.filter((f) => f.contribution > 0);
  return (
    <Card className="p-6">
      <div className="flex items-baseline justify-between">
        <Eyebrow icon={ListChecks}>Why this score</Eyebrow>
        <span className="font-mono text-[12px] text-muted tnum">Σ {risk.score}</span>
      </div>
      {factors.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Within this patient's normal range">No factor is adding to the score right now.</EmptyState>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {factors.map((f, i) => <FactorRow key={f.factor} f={f} offset={factors.slice(0, i).reduce((s, x) => s + x.contribution, 0)} total={Math.max(risk.score, 1)} i={i} />)}
        </div>
      )}
    </Card>
  );
}

// Each kind of factor wears one icon, so a doctor can scan the list by kind.
const FACTOR_ICON: Record<string, LucideIcon> = {
  news2: ShieldPlus,
  qsofa: Microscope,
  baseline: Target,
  trend: TrendingUp,
  symptom: ClipboardList,
  adherence: Pill,
  medication: Pill,
  escalation: Siren,
};

function VitalIcon({ vital }: { vital: VitalKey }) {
  const Icon = VITAL_ICON[vital];
  return <Icon {...ic(13)} className="shrink-0" />;
}

/** Waterfall row: each bar starts where the previous factor ended, so the bars add up to the score. */
function FactorRow({ f, offset, total, i }: { f: Factor; offset: number; total: number; i: number }) {
  const escalation = f.kind === "escalation";
  const Icon = FACTOR_ICON[f.kind] ?? Activity;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="flex items-center gap-2 text-[14px] font-medium">
          <Icon {...ic(14)} className={cx("shrink-0 self-center", escalation ? "text-critical" : "text-teal")} />
          {f.headline}
        </span>
        <span className="font-mono text-[13px] text-muted tnum">+{f.contribution.toFixed(1)}</span>
      </div>
      <div className="relative mt-1.5 h-2 rounded-full bg-surface-2">
        <motion.div
          className={cx("absolute inset-y-0 rounded-full", escalation ? "bg-critical" : "bg-teal")}
          style={{ left: `${(offset / total) * 100}%` }}
          initial={{ width: 0 }}
          animate={{ width: `${(f.contribution / total) * 100}%` }}
          transition={{ duration: 0.8, delay: 0.1 + i * 0.08, ease: EASE }}
        />
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">{f.message}</p>
    </div>
  );
}

/** "+1.2", "−0.4", or "0.0" — never a signed zero. */
function fmtSlope(v: number) {
  const r = Math.round(v * 10) / 10;
  if (r === 0) return "0.0";
  return `${r > 0 ? "+" : "−"}${Math.abs(r).toFixed(1)}`;
}

function VitalPanel({ vital, risk, loading, error, children }: { vital: VitalKey; risk?: Risk; loading: boolean; error?: Error; children: React.ReactNode }) {
  const meta = VITALS[vital];
  const dev = risk?.deviations[vital];
  const trend = risk?.trends[vital];
  const b = risk?.baselines[vital];
  const flagged = dev?.flagged || trend?.flagged;
  return (
    <Card className={cx("p-5", flagged && "border-watch/40")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow flex items-center gap-2"><VitalIcon vital={vital} />{meta.label}{vital === "sbp" ? " / diastolic" : ""}</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-[26px] leading-none tnum">{dev ? fmtVital(vital, dev.value) : "—"}</span>
            <span className="text-[12px] text-muted">{meta.unit}</span>
          </div>
        </div>
        <div className="text-right font-mono text-[11px] leading-relaxed text-muted tnum">
          {b && <div>normal {fmtVital(vital, b.low)}–{fmtVital(vital, vital === "spo2" ? Math.min(100, b.high) : b.high)}</div>}
          {trend && <div className={cx(trend.flagged && "text-watch")}>{fmtSlope(trend.slope_per_hr)}/hr</div>}
        </div>
      </div>
      <div className="mt-3">
        {error && loading ? <div className="grid h-[180px] place-items-center text-[13px] text-muted">Couldn't load readings</div> : loading ? <Skeleton className="h-[180px]" /> : children}
      </div>
    </Card>
  );
}

const NEWS2_ROWS: { key: string; label: string; value: (r: Risk) => string }[] = [
  { key: "rr", label: "Respiratory rate", value: (r) => fmtVital("rr", r.deviations.rr?.value) },
  { key: "spo2", label: "SpO₂", value: (r) => fmtVital("spo2", r.deviations.spo2?.value) },
  { key: "oxygen", label: "Air or oxygen", value: (r) => (r.news2.parameters.oxygen ? "Oxygen" : "Air") },
  { key: "temp", label: "Temperature", value: (r) => fmtVital("temp", r.deviations.temp?.value) },
  { key: "sbp", label: "Systolic BP", value: (r) => fmtVital("sbp", r.deviations.sbp?.value) },
  { key: "hr", label: "Heart rate", value: (r) => fmtVital("hr", r.deviations.hr?.value) },
  { key: "consciousness", label: "Consciousness", value: (r) => (r.news2.parameters.consciousness ? "New confusion / VPU" : "Alert") },
];

function News2Card({ risk }: { risk?: Risk }) {
  if (!risk) return <Skeleton className="h-[300px] rounded-3xl" />;
  const q = risk.qsofa;
  return (
    <Card className="p-6">
      <div className="flex items-baseline justify-between">
        <Eyebrow icon={ShieldPlus}>NEWS2 breakdown</Eyebrow>
        <span className="font-mono text-[13px] tnum">{risk.news2.total} · {risk.news2.band}</span>
      </div>
      <table className="mt-4 w-full text-[13px]">
        <tbody>
          {NEWS2_ROWS.map((row) => {
            const pts = risk.news2.parameters[row.key] ?? 0;
            return (
              <tr key={row.key} className="border-t border-line">
                <td className="py-2 text-ink-2">{row.label}</td>
                <td className="py-2 text-right font-mono text-muted tnum">{row.value(risk)}</td>
                <td className={cx("w-10 py-2 text-right font-mono tnum", pts === 0 ? "text-faint" : pts === 3 ? "text-critical" : "text-warning")}>+{pts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-[12px] leading-relaxed text-muted">{risk.news2.response}</p>
      <div className="mt-5 border-t border-line pt-4">
        <div className="flex items-baseline justify-between">
          <Eyebrow icon={Microscope}>qSOFA sepsis screen</Eyebrow>
          <span className={cx("font-mono text-[13px] tnum", q.flag ? "text-critical" : "text-muted")}>{q.score}/3{q.flag ? " · flag" : ""}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[["rr_ge_22", "RR ≥ 22"], ["sbp_le_100", "SBP ≤ 100"], ["altered_mentation", "Altered mentation"]].map(([k, label]) => (
            <span key={k} className={cx("rounded-full px-2.5 py-0.5 text-[11px]", q.criteria[k] ? "bg-critical-soft text-critical" : "bg-surface-2 text-muted")}>{label}</span>
          ))}
        </div>
      </div>
    </Card>
  );
}

