import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  BellRing,
  Brain,
  CalendarClock,
  CalendarDays,
  Check,
  CircleAlert,
  ClipboardList,
  Eye,
  EyeOff,
  Gauge,
  History,
  Lock,
  NotebookPen,
  Pill,
  Repeat,
  ShieldCheck,
  Siren,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Brush, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, useQuery } from "../lib/api";
import { LEVEL_STYLE, VITALS, fmtDay, fmtTime, fmtVital, istDateKey } from "../lib/format";
import type { Appointment, Insights, Level, Medication, Patient, Priority, Risk, TimelineEvent, Vital, VitalKey } from "../lib/types";
import { Sparkline } from "./Sparkline";
import { Card, EmptyState, Eyebrow, Skeleton, cx } from "./ui";

/*
 * The doctor's toolkit: explainable risk with a confidence indicator, mental-health and
 * history cards, recent changes, an interactive trend explorer, a medication calendar with
 * missed-dose patterns, the longitudinal timeline, and notes / follow-ups / appointments.
 */

/* ------------------------------------------------------------------ risk words, priority, confidence */

export const RISK_WORD: Record<Level, string> = { Stable: "Low", Watch: "Moderate", Warning: "High", Critical: "Critical" };
export const PRIORITY_STYLE: Record<Priority, { text: string; soft: string; dot: string; border: string; icon: LucideIcon }> = {
  Critical: { ...LEVEL_STYLE.Critical, icon: Siren },
  High: { ...LEVEL_STYLE.Warning, icon: TriangleAlert },
  Moderate: { ...LEVEL_STYLE.Watch, icon: Eye },
};

const QUALITY_STYLE = { Good: "text-stable", Fair: "text-watch", Poor: "text-critical" } as const;

/** "High risk · 82% confidence · Good data" — with the reasons on hover and on focus. */
export function ConfidenceBadge({ level, confidence, quality, reasons, size = "md" }: {
  level: Level; confidence: number; quality: "Good" | "Fair" | "Poor"; reasons?: string[]; size?: "sm" | "md";
}) {
  const s = LEVEL_STYLE[level];
  return (
    <span className="group relative inline-flex">
      <span tabIndex={0} className={cx("inline-flex items-center gap-2 rounded-full border border-line bg-surface font-mono tnum outline-none", size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-[12px]")}>
        <span className={cx("inline-flex items-center gap-1.5 font-sans font-medium", s.text)}>
          <span className={cx("size-2 rounded-full", s.dot)} />{RISK_WORD[level]} risk
        </span>
        <span className="text-faint">·</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="relative h-1.5 w-10 overflow-hidden rounded-full bg-surface-2">
            <motion.span className="absolute inset-y-0 left-0 rounded-full bg-teal" initial={{ width: 0 }} animate={{ width: `${confidence}%` }} transition={{ duration: 0.8 }} />
          </span>
          {confidence}%<span className="font-sans text-muted">confidence</span>
        </span>
        <span className="text-faint">·</span>
        <span className={cx("font-sans", QUALITY_STYLE[quality])}>{quality} data</span>
      </span>
      {reasons && reasons.length > 0 && (
        <span role="tooltip" className="pointer-events-none absolute top-full left-0 z-30 mt-2 w-72 rounded-2xl border border-line-2 bg-surface p-3 text-[12px] leading-relaxed text-ink-2 opacity-0 shadow-2xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <span className="block font-medium text-ink">How sure is AYU?</span>
          <span className="mt-1 block text-muted">A transparent heuristic, not a calibrated probability:</span>
          {reasons.map((r) => <span key={r} className="block">• {r}</span>)}
        </span>
      )}
    </span>
  );
}

/** The strip under the patient header: confidence, data quality detail and what needs review. */
export function InsightStrip({ ins, risk }: { ins?: Insights; risk?: Risk }) {
  if (!ins || !risk) return <Skeleton className="h-14 rounded-2xl" />;
  const q = ins.data_quality;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface/70 p-4 backdrop-blur lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <ConfidenceBadge level={risk.level} confidence={ins.confidence} quality={q.label} reasons={ins.confidence_reasons} />
        <span className="font-mono text-[11px] text-muted tnum">
          {Math.round(q.completeness * 100)}% of expected readings · last {q.last_reading_min < 1 ? "<1" : Math.round(q.last_reading_min)} min ago · baselines {Math.round(q.baseline_coverage * 100)}%
        </span>
      </div>
      {ins.needs_review.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-watch"><CircleAlert size={14} aria-hidden />Needs review</span>
          {ins.needs_review.slice(0, 3).map((t) => <span key={t} className="rounded-full bg-watch-soft px-2.5 py-0.5 text-[12px] text-watch">{t}</span>)}
        </div>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-[12px] text-stable"><ShieldCheck size={14} aria-hidden />No patterns needing review</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ overview cards */

const MOOD_E = ["😣", "🙁", "😐", "🙂", "😄"];

export function MentalHealthCard({ ins }: { ins?: Insights }) {
  return (
    <Card className="h-full p-6">
      <Eyebrow icon={Brain}>Mood & wellbeing</Eyebrow>
      <p className="mt-1 text-[11px] text-faint">Self-reported daily check-ins — an indicator, not a screening tool.</p>
      {!ins ? <Skeleton className="mt-4 h-32" /> : ins.mood.count === 0 ? (
        <div className="mt-4"><EmptyState title="No check-ins yet" icon={Brain} /></div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {([["Mood", ins.mood.mood_avg, 5], ["Energy", ins.mood.energy_avg, 3], ["Sleep", ins.mood.sleep_avg, 3]] as const).map(([k, v, max]) => (
              <div key={k} className="rounded-2xl bg-surface-2 p-3">
                <div className="text-[11px] text-muted">{k} (avg)</div>
                <div className="mt-1 font-display text-[26px] leading-none tnum">{v ?? "—"}<span className="text-[12px] text-muted">/{max}</span></div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-end justify-between gap-4">
            <div className="flex gap-1.5">
              {ins.mood.series.slice(-7).map((c) => (
                <span key={c.ts} title={`${fmtDay(c.ts)} · mood ${c.mood}/5`} className="flex flex-col items-center gap-0.5 rounded-lg bg-surface-2 px-1.5 py-1">
                  <span className="text-[16px] leading-none">{MOOD_E[c.mood - 1]}</span>
                  <span className="text-[9px] text-faint">{fmtDay(c.ts).split(" ")[0]}</span>
                </span>
              ))}
            </div>
            <div className="w-28"><Sparkline values={ins.mood.series.map((c) => c.mood)} color="var(--violet, var(--teal))" height={32} /></div>
          </div>
          {ins.mood_changes.map((m) => (
            <div key={m.text} className="mt-3 flex items-center gap-2 rounded-xl bg-watch-soft px-3 py-2 text-[12px] text-watch"><TrendingDown size={14} aria-hidden />{m.text}</div>
          ))}
        </>
      )}
    </Card>
  );
}

export function HistoryCard({ p }: { p?: Patient }) {
  return (
    <Card className="h-full p-6">
      <Eyebrow icon={History}>Medical history</Eyebrow>
      {!p ? <Skeleton className="mt-4 h-32" /> : (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {p.conditions.map((c) => <span key={c} className="rounded-full bg-surface-2 px-3 py-0.5 text-[12px]">{c}</span>)}
          </div>
          <ol className="relative mt-4 space-y-3 border-l border-line pl-4">
            {(p.history ?? []).map((h, i) => (
              <li key={i} className="relative">
                <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-surface bg-teal" />
                <span className="font-mono text-[11px] text-muted">{h.year}</span>
                <div className="text-[13px] text-ink-2">{h.event}</div>
              </li>
            ))}
          </ol>
          {p.notes && <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-muted">{p.notes}</p>}
        </>
      )}
    </Card>
  );
}

export function RecentChanges({ ins, risk }: { ins?: Insights; risk?: Risk }) {
  const trends = risk ? Object.entries(risk.trends).filter(([, t]) => t?.flagged) : [];
  const devs = risk ? Object.entries(risk.deviations).filter(([, d]) => d?.flagged) : [];
  return (
    <Card className="h-full p-6">
      <Eyebrow icon={Activity}>Recent changes</Eyebrow>
      {!ins || !risk ? <Skeleton className="mt-4 h-32" /> : ins.sudden_changes.length + trends.length + devs.length + ins.missed_patterns.length === 0 ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-stable-soft px-3 py-2.5 text-[13px] text-stable"><ShieldCheck size={16} aria-hidden />No meaningful change in the last hours.</div>
      ) : (
        <ul className="mt-3 space-y-2">
          {ins.sudden_changes.map((c) => <ChangeRow key={c.vital} c={c} />)}
          {trends.map(([k, t]) => (
            <li key={`t-${k}`} className="flex items-center gap-2 text-[13px]">
              {t!.slope_per_hr > 0 ? <TrendingUp size={15} className="text-watch" aria-hidden /> : <TrendingDown size={15} className="text-watch" aria-hidden />}
              <span>{VITALS[k as VitalKey]?.label ?? k} {t!.slope_per_hr > 0 ? "rising" : "falling"} {Math.abs(t!.slope_per_hr).toFixed(1)}/hr over {t!.window_hr} h</span>
            </li>
          ))}
          {devs.map(([k, d]) => (
            <li key={`d-${k}`} className="flex items-center gap-2 text-[13px]">
              <Gauge size={15} className="text-watch" aria-hidden />
              <span>{VITALS[k as VitalKey]?.label ?? k} {fmtVital(k as VitalKey, d!.value)} — {d!.z > 0 ? "above" : "below"} personal baseline (z {d!.z > 0 ? "+" : ""}{d!.z})</span>
            </li>
          ))}
          {ins.missed_patterns.slice(0, 2).map((m) => (
            <li key={m.text} className="flex items-center gap-2 text-[13px]"><Repeat size={15} className="text-critical" aria-hidden />{m.text}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ChangeRow({ c }: { c: Insights["sudden_changes"][number] }) {
  const up = (c.delta ?? 0) > 0;
  return (
    <li className={cx("flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-[13px]", c.severity === "High" ? "bg-critical-soft text-critical" : "bg-watch-soft text-watch")}>
      {c.sudden ? (up ? <TrendingUp size={15} aria-hidden /> : <TrendingDown size={15} aria-hidden />) : <CircleAlert size={15} aria-hidden />}
      <span className="font-medium">{c.label}</span>
      <span className="font-mono tnum">{c.from ?? "—"} → {c.to} {c.unit}</span>
      {c.delta != null && <span className="font-mono tnum opacity-80">({up ? "+" : ""}{c.delta} in ~1 h)</span>}
      {!c.sudden && c.abnormal && <span className="opacity-80">out of safe range</span>}
      <span className="ml-auto text-[11px] uppercase tracking-wide opacity-80">{c.severity}</span>
    </li>
  );
}

/* ------------------------------------------------------------------ interactive trends */

export const TREND_RANGES = ["24h", "7d", "30d"] as const;
export type TrendRange = (typeof TREND_RANGES)[number];
const EXPLORE: { key: VitalKey; second?: VitalKey }[] = [
  { key: "sbp", second: "dbp" }, { key: "hr" }, { key: "spo2" }, { key: "temp" }, { key: "rr" }, { key: "glucose" },
];

export function TrendExplorer({ data, risk, range, setRange }: { data?: Vital[]; risk?: Risk; range: TrendRange; setRange: (r: TrendRange) => void }) {
  const [vital, setVital] = useState<VitalKey>("sbp");
  const [showBand, setShowBand] = useState(true);
  const cfg = EXPLORE.find((e) => e.key === vital)!;
  const meta = VITALS[vital];
  const b = risk?.baselines[vital];
  const rows = useMemo(() => (data ?? []).map((d) => ({ t: d.ts, a: d[vital] as number | null, b: cfg.second ? (d[cfg.second] as number) : undefined })), [data, vital, cfg.second]);
  const vals = rows.map((r) => r.a).filter((v): v is number => v != null && Number.isFinite(v));
  const stats = vals.length ? { min: Math.min(...vals), max: Math.max(...vals), mean: vals.reduce((s, v) => s + v, 0) / vals.length, cur: vals[vals.length - 1] } : null;
  const spanDays = data && data.length > 1 ? (Date.parse(data[data.length - 1].ts) - Date.parse(data[0].ts)) / 86_400_000 : 0;
  const tickFmt = (v: string) => (range === "24h" ? fmtTime(v) : fmtDay(v));
  let lo = stats ? Math.min(stats.min, showBand && b ? b.low : Infinity) : 0;
  let hi = stats ? Math.max(stats.max, showBand && b ? b.high : -Infinity) : 1;
  const pad = (hi - lo) * 0.1 || 1;
  lo -= pad;
  hi += pad;
  const trend = risk?.trends[vital];
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {EXPLORE.map((e) => (
            <button key={e.key} type="button" onClick={() => setVital(e.key)} aria-pressed={vital === e.key}
              className={cx("h-9 rounded-full px-3.5 text-[13px] transition-colors", vital === e.key ? "bg-ink text-bg" : "border border-line text-muted hover:text-ink")}>
              {e.key === "sbp" ? "Blood pressure" : VITALS[e.key].label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowBand((x) => !x)} aria-pressed={showBand}
            className={cx("h-9 rounded-full px-3.5 text-[12px] transition-colors", showBand ? "bg-teal-soft text-teal" : "border border-line text-muted")}>
            Personal baseline {showBand ? "on" : "off"}
          </button>
          <div className="flex gap-1 rounded-full border border-line p-1">
            {TREND_RANGES.map((rg) => (
              <button key={rg} type="button" onClick={() => setRange(rg)} className={cx("h-7 rounded-full px-3.5 font-mono text-[12px] transition-colors", range === rg ? "bg-ink text-bg" : "text-muted hover:text-ink")}>{rg}</button>
            ))}
          </div>
        </div>
      </div>
      {!data ? <Skeleton className="mt-5 h-[300px]" /> : vals.length < 2 ? (
        <div className="mt-5 grid h-[300px] place-items-center text-[13px] text-muted">No readings in this range</div>
      ) : (
        <>
          <div className="mt-5">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                {showBand && b && <ReferenceArea y1={Math.max(lo, b.low)} y2={Math.min(hi, b.high)} fill="var(--band)" fillOpacity={1} stroke="none" ifOverflow="hidden" />}
                <XAxis dataKey="t" tickFormatter={tickFmt} tick={{ fontSize: 10, fill: "var(--muted)", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} minTickGap={56} />
                <YAxis domain={[lo, hi]} tick={{ fontSize: 10, fill: "var(--muted)", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => v.toFixed(meta.decimals)} />
                <Tooltip
                  cursor={{ stroke: "var(--line-2)" }}
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-2)", borderRadius: 12, fontSize: 12, fontFamily: "var(--font-mono)" }}
                  labelFormatter={(l) => `${fmtDay(String(l))} ${fmtTime(String(l))}`}
                  formatter={(v, name) => [`${fmtVital(name === "b" && cfg.second ? cfg.second : vital, Number(v))} ${meta.unit}`, name === "b" && cfg.second ? VITALS[cfg.second].short : meta.short]}
                />
                <Line dataKey="a" type="monotone" stroke="var(--teal)" strokeWidth={1.8} dot={false} isAnimationActive={false} />
                {cfg.second && <Line dataKey="b" type="monotone" stroke="var(--ink-2)" strokeOpacity={0.55} strokeWidth={1.5} dot={false} isAnimationActive={false} />}
                <Brush dataKey="t" height={26} stroke="var(--teal)" fill="var(--surface-2)" travellerWidth={8} tickFormatter={tickFmt} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {stats && ([
              ["Now", stats.cur], ["Min", stats.min], ["Max", stats.max], ["Mean", stats.mean], ["Baseline", b?.mean ?? null],
            ] as const).map(([k, v]) => (
              <div key={k} className="rounded-xl bg-surface-2 px-3 py-2">
                <div className="text-[11px] text-muted">{k}</div>
                <div className="font-mono text-[16px] tnum">{v == null ? "—" : fmtVital(vital, v)} <span className="text-[10px] text-muted">{meta.unit}</span></div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-muted">
            Drag the handles under the chart to zoom.{trend ? ` 3-hour slope ${trend.slope_per_hr > 0 ? "+" : ""}${trend.slope_per_hr.toFixed(2)} ${meta.unit}/hr${trend.flagged ? " — flagged as sustained" : ""}.` : ""}
            {range === "30d" && spanDays < 29 && ` AYU has ${Math.max(1, Math.round(spanDays))} days of readings for this patient so far.`}
          </p>
        </>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ medication calendar */

type Cell = "taken" | "delayed" | "missed" | "pending";
const LATE_MS = 30 * 60_000;
const cellOf = (status: string, scheduled: string, recorded: string | null): Cell =>
  status === "taken" ? (recorded && Date.parse(recorded) - Date.parse(scheduled) > LATE_MS ? "delayed" : "taken") : (status as Cell);
const CELL: Record<Cell, string> = { taken: "bg-teal", delayed: "bg-watch", missed: "bg-critical", pending: "border border-line-2" };

export function MedicationCalendar({ meds, ins, risk, now }: { meds?: Medication[]; ins?: Insights; risk?: Risk; now?: string }) {
  const days = useMemo(() => {
    const keys = new Set<string>();
    meds?.forEach((m) => m.doses.forEach((d) => keys.add(istDateKey(d.scheduled_at))));
    return [...keys].sort().slice(-9);
  }, [meds]);
  const today = now ? istDateKey(now) : "";
  const medAlerts = risk?.factors.filter((f) => (f.kind === "adherence" || f.kind === "medication") && f.contribution > 0) ?? [];
  const overall = risk?.adherence.pct;
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px] [&>*]:min-w-0">
      <Card className="p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <Eyebrow icon={CalendarDays}>Medication calendar</Eyebrow>
          <div className="flex items-baseline gap-2">
            <span className="text-[12px] text-muted">Adherence · 7 days</span>
            <span className={cx("font-display text-[28px] leading-none tnum", overall == null ? "" : overall >= 90 ? "text-stable" : overall >= 70 ? "text-watch" : "text-critical")}>{overall == null ? "—" : `${Math.round(overall)}%`}</span>
          </div>
        </div>
        {!meds ? <Skeleton className="mt-4 h-52" /> : meds.length === 0 ? <div className="mt-4"><EmptyState title="No medicines on record" /></div> : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr>
                  <th className="pb-2 text-left font-normal text-muted">Medicine</th>
                  {days.map((d) => (
                    <th key={d} className={cx("pb-2 text-center font-mono text-[10px] font-normal tracking-wide", d === today ? "text-teal" : "text-muted")}>
                      {d === today ? "Today" : fmtDay(`${d}T06:30:00Z`)}
                    </th>
                  ))}
                  <th className="pb-2 text-right font-normal text-muted">7 d</th>
                </tr>
              </thead>
              <tbody>
                {meds.map((m) => (
                  <tr key={m.id} className="border-t border-line">
                    <td className="py-3 pr-4">
                      <div className="font-medium">{m.name} <span className="font-normal text-muted">{m.dose}</span></div>
                      <div className="text-[11px] text-muted">{m.times.join(" · ")}{m.critical && <span className="ml-1.5 text-critical">critical</span>}</div>
                    </td>
                    {days.map((d) => {
                      const ds = m.doses.filter((x) => istDateKey(x.scheduled_at) === d);
                      return (
                        <td key={d} className={cx("py-3 text-center", d === today && "bg-teal-soft/40")}>
                          <div className="inline-flex flex-col gap-1">
                            {ds.map((x, i) => (
                              <motion.span key={x.id} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.02 }}
                                title={`${fmtTime(x.scheduled_at)} · ${cellOf(x.status, x.scheduled_at, x.recorded_at)}`}
                                className={cx("block size-3.5 rounded-[4px]", CELL[cellOf(x.status, x.scheduled_at, x.recorded_at)])} />
                            ))}
                          </div>
                        </td>
                      );
                    })}
                    <td className={cx("py-3 text-right font-mono tnum", m.adherence_pct == null ? "text-muted" : m.adherence_pct >= 90 ? "text-stable" : m.adherence_pct >= 70 ? "text-watch" : "text-critical")}>
                      {m.adherence_pct == null ? "—" : `${Math.round(m.adherence_pct)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted">
              {(["taken", "delayed", "missed", "pending"] as Cell[]).map((c) => (
                <span key={c} className="inline-flex items-center gap-1.5"><span className={cx("size-2.5 rounded-[3px]", CELL[c])} />{c === "pending" ? "Upcoming" : c[0].toUpperCase() + c.slice(1)}</span>
              ))}
            </div>
          </div>
        )}
      </Card>
      <Card className="p-6">
        <Eyebrow icon={Repeat}>Missed-dose patterns</Eyebrow>
        {!ins ? <Skeleton className="mt-4 h-40" /> : ins.missed_patterns.length === 0 && medAlerts.length === 0 ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-stable-soft px-3 py-2.5 text-[13px] text-stable"><ShieldCheck size={16} aria-hidden />No recurring misses found.</div>
        ) : (
          <ul className="mt-4 space-y-2">
            {ins.missed_patterns.map((p) => {
              const Icon = p.kind === "weekday" ? CalendarClock : p.kind === "streak" ? Repeat : p.kind === "critical" ? Siren : Pill;
              return (
                <motion.li key={p.text} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                  className={cx("flex items-start gap-2 rounded-xl px-3 py-2.5 text-[13px]", p.kind === "critical" ? "bg-critical-soft text-critical" : "bg-watch-soft text-watch")}>
                  <Icon size={15} className="mt-0.5 shrink-0" aria-hidden />
                  <span>{p.text}</span>
                </motion.li>
              );
            })}
            {medAlerts.map((f) => (
              <li key={f.factor} className="flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] text-ink-2">
                <BellRing size={15} className="mt-0.5 shrink-0 text-warning" aria-hidden />
                <span><span className="font-medium">{f.headline}</span> — adds {f.contribution.toFixed(1)} to the AYU score</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ longitudinal timeline */

const DT_RANGES: { label: string; hours: number }[] = [{ label: "48 h", hours: 48 }, { label: "7 d", hours: 168 }, { label: "30 d", hours: 720 }];
type DKind = "all" | TimelineEvent["kind"];
const DKINDS: { k: DKind; label: string; icon?: LucideIcon }[] = [
  { k: "all", label: "All" }, { k: "status", label: "Status", icon: Activity }, { k: "alert", label: "Alerts", icon: BellRing },
  { k: "reading", label: "Vitals", icon: Gauge }, { k: "symptom", label: "Symptoms", icon: ClipboardList }, { k: "dose", label: "Medication", icon: Pill },
  { k: "checkin", label: "Mental health", icon: Brain }, { k: "note", label: "Notes", icon: NotebookPen }, { k: "appointment", label: "Appointments", icon: CalendarDays },
];

function dView(e: TimelineEvent): { title: string; detail?: string; tone: string; icon: LucideIcon } {
  const lvl = (l: string | null) => (l ? `${l}` : "");
  switch (e.kind) {
    case "status": return { title: `Level → ${lvl(e.level)}`, detail: `from ${lvl(e.prev_level)} · AYU ${e.values.score ?? ""} · NEWS2 ${e.values.news2 ?? ""}`, tone: LEVEL_STYLE[(e.level ?? "Stable") as Level].soft + " " + LEVEL_STYLE[(e.level ?? "Stable") as Level].text, icon: Activity };
    case "symptom": return { title: `Symptom: ${e.label_en}`, detail: [e.severity, e.source !== "sim" ? e.source : "", e.source === "sim" ? "" : e.note].filter(Boolean).join(" · ") || undefined, tone: e.level === "Critical" || e.severity === "severe" ? "bg-critical-soft text-critical" : "bg-sky-soft text-sky", icon: ClipboardList };
    case "dose": return { title: `${e.medicine} ${e.sub === "missed" ? "missed" : e.sub === "delayed" ? "taken late" : "taken"}`, tone: e.sub === "missed" ? "bg-critical-soft text-critical" : e.sub === "delayed" ? "bg-watch-soft text-watch" : "bg-stable-soft text-stable", icon: Pill };
    case "reading": {
      const v = e.values;
      return { title: `Manual reading (${e.source})`, detail: [v.hr != null && `HR ${Math.round(v.hr)}`, v.spo2 != null && `SpO₂ ${Math.round(v.spo2)}%`, v.sbp != null && `BP ${Math.round(v.sbp)}/${Math.round(v.dbp ?? 0)}`, v.temp != null && `${v.temp.toFixed(1)}°C`].filter(Boolean).join(" · "), tone: "bg-sky-soft text-sky", icon: Gauge };
    }
    case "alert":
      if (e.sub === "acknowledged") return { title: `Acknowledged by ${e.by || "care team"}`, detail: e.note ? `“${e.note.split("\n").pop()}”` : undefined, tone: "bg-teal-soft text-teal", icon: Stethoscope };
      if (e.sub === "resolved") return { title: "Alert resolved", tone: "bg-stable-soft text-stable", icon: Check };
      return { title: e.sub === "escalated" ? `Alert escalated to ${lvl(e.level)}` : `Alert raised · ${lvl(e.level)}`, tone: LEVEL_STYLE[(e.level ?? "Watch") as Level].soft + " " + LEVEL_STYLE[(e.level ?? "Watch") as Level].text, icon: BellRing };
    case "checkin": return { title: `Check-in: mood ${e.mood}/5 ${MOOD_E[(e.mood ?? 3) - 1]}`, detail: [`energy ${e.values.energy}/3`, `sleep ${e.values.sleep}/3`, e.note].filter(Boolean).join(" · "), tone: "bg-violet-soft text-violet", icon: Brain };
    case "note": return { title: `${e.sub === "followup" ? "Follow-up" : "Note"} · ${e.by}`, detail: e.note, tone: e.source === "private" ? "bg-surface-2 text-muted" : "bg-teal-soft text-teal", icon: e.source === "private" ? Lock : NotebookPen };
    case "appointment": return { title: `Appointment ${e.sub}`, detail: [e.source === "video" ? "video" : "in person", e.by === "patient" ? "requested by patient" : "booked by doctor", e.note].filter(Boolean).join(" · "), tone: "bg-violet-soft text-violet", icon: CalendarDays };
  }
}

export function DoctorTimeline({ patientId, p }: { patientId: string; p?: Patient }) {
  const [hours, setHours] = useState(168);
  const [kind, setKind] = useState<DKind>("all");
  const [limit, setLimit] = useState(40);
  const q = useQuery((s) => api.timeline(patientId, hours, s), [patientId, hours]);
  const events = (q.data ?? []).filter((e) => kind === "all" || e.kind === kind);
  const shown = events.slice(0, limit);
  const groups: { day: string; items: TimelineEvent[] }[] = [];
  for (const e of shown) {
    const d = istDateKey(e.ts);
    const g = groups[groups.length - 1];
    if (g && g.day === d) g.items.push(e);
    else groups.push({ day: d, items: [e] });
  }
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow icon={History}>Longitudinal health story</Eyebrow>
        <div className="flex gap-1 rounded-full border border-line p-1">
          {DT_RANGES.map((r) => (
            <button key={r.hours} type="button" onClick={() => { setHours(r.hours); setLimit(40); }} className={cx("h-7 rounded-full px-3.5 font-mono text-[12px]", hours === r.hours ? "bg-ink text-bg" : "text-muted hover:text-ink")}>{r.label}</button>
          ))}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {DKINDS.map((x) => (
          <button key={x.k} type="button" onClick={() => { setKind(x.k); setLimit(40); }} aria-pressed={kind === x.k}
            className={cx("inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px]", kind === x.k ? "bg-ink text-bg" : "border border-line text-muted hover:text-ink")}>
            {x.icon && <x.icon size={12} aria-hidden />}{x.label}
          </button>
        ))}
      </div>
      {!q.data ? <Skeleton className="mt-5 h-64" /> : shown.length === 0 ? <p className="mt-5 text-[13px] text-muted">Nothing in this range.</p> : (
        <div className="mt-5 space-y-5">
          {groups.map((g) => (
            <div key={g.day}>
              <div className="mb-2 inline-block rounded-full bg-surface-2 px-3 py-1 font-mono text-[11px] text-ink-2">{fmtDay(`${g.day}T06:30:00Z`)}</div>
              <ol className="relative space-y-2 pl-10">
                <span className="absolute top-1 bottom-1 left-[15px] w-px bg-line-2" aria-hidden />
                {g.items.map((e, i) => {
                  const v = dView(e);
                  return (
                    <motion.li key={`${e.kind}-${e.ts}-${i}`} className="relative" initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.3 }}>
                      <span className={cx("absolute -left-10 grid size-8 place-items-center rounded-full ring-4 ring-surface", v.tone)}><v.icon size={14} aria-hidden /></span>
                      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-line px-3.5 py-2">
                        <span className="text-[13px] font-medium">{v.title}</span>
                        <span className="font-mono text-[11px] text-faint">{fmtTime(e.ts)}</span>
                        {v.detail && <span className="w-full text-[12px] text-muted">{v.detail}</span>}
                      </div>
                    </motion.li>
                  );
                })}
              </ol>
            </div>
          ))}
          {events.length > limit && <button type="button" onClick={() => setLimit((n) => n + 40)} className="h-9 rounded-full border border-line-2 px-4 text-[12px] text-muted hover:text-ink">Show more</button>}
        </div>
      )}
      {p && p.history?.length > 0 && kind === "all" && (
        <div className="mt-6 border-t border-line pt-4">
          <div className="mb-2 text-[12px] text-muted">Before this admission</div>
          <ol className="space-y-1.5">
            {[...p.history].reverse().map((h, i) => (
              <li key={i} className="flex gap-3 text-[13px]"><span className="w-12 shrink-0 font-mono text-[11px] text-muted">{h.year}</span><span className="text-ink-2">{h.event}</span></li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ notes, follow-ups, appointments */

export function NotesAndCare({ patientId }: { patientId: string }) {
  const notes = useQuery((s) => api.notes(patientId, false, s), [patientId]);
  const appts = useQuery((s) => api.appointments(patientId, s), [patientId]);
  const [kind, setKind] = useState<"note" | "followup">("note");
  const [text, setText] = useState("");
  const [visible, setVisible] = useState(true);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();

  const save = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setErr(undefined);
    try {
      await api.addNote(patientId, { text, kind, visible: kind === "followup" ? true : visible, follow_up_on: kind === "followup" ? date : "" });
      setText("");
      setDate("");
      notes.reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr] [&>*]:min-w-0">
      <Card className="p-6">
        <Eyebrow icon={NotebookPen}>Notes & follow-up</Eyebrow>
        <div className="mt-4 flex gap-1 rounded-full border border-line p-1 w-fit">
          {(["note", "followup"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={cx("h-8 rounded-full px-4 text-[13px]", kind === k ? "bg-ink text-bg" : "text-muted hover:text-ink")}>
              {k === "note" ? "Clinical note" : "Follow-up instruction"}
            </button>
          ))}
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000}
          placeholder={kind === "note" ? "e.g. Reviewed at bedside; SpO₂ improving on 2 L O₂." : "e.g. Peak-flow diary twice a day for 3 days."}
          className="mt-3 w-full resize-none rounded-2xl border border-line bg-bg px-4 py-3 text-[14px] outline-none focus:border-line-2" />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {kind === "note" ? (
            <button type="button" onClick={() => setVisible((v) => !v)} aria-pressed={visible}
              className={cx("inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[12px]", visible ? "bg-teal-soft text-teal" : "border border-line text-muted")}>
              {visible ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}{visible ? "Visible to patient" : "Private (care team only)"}
            </button>
          ) : (
            <label className="inline-flex items-center gap-2 text-[12px] text-muted">Follow up on
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 rounded-full border border-line bg-bg px-3 text-[13px] text-ink" />
            </label>
          )}
          <button type="button" onClick={save} disabled={busy || !text.trim()} className="ml-auto inline-flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-[13px] font-medium text-bg hover:bg-teal disabled:opacity-40">
            <Check size={14} aria-hidden />Save
          </button>
        </div>
        {err && <p className="mt-2 text-[12px] text-critical">{err}</p>}
        <ul className="mt-5 space-y-2">
          <AnimatePresence initial={false}>
            {(notes.data ?? []).map((n) => (
              <motion.li key={n.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-line p-3.5">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  <span className={cx("rounded-full px-2 py-0.5", n.kind === "followup" ? "bg-violet-soft text-violet" : "bg-surface-2")}>{n.kind === "followup" ? "Follow-up" : "Note"}</span>
                  {n.visible ? <span className="inline-flex items-center gap-1 text-teal"><Eye size={11} aria-hidden />patient sees this</span> : <span className="inline-flex items-center gap-1"><Lock size={11} aria-hidden />private</span>}
                  {n.follow_up_on && <span className="inline-flex items-center gap-1"><CalendarClock size={11} aria-hidden />{n.follow_up_on}</span>}
                  <span className="ml-auto font-mono">{n.author} · {fmtDay(n.ts)} {fmtTime(n.ts)}</span>
                </div>
                <p className="mt-1.5 text-[14px] leading-relaxed">{n.text}</p>
              </motion.li>
            ))}
          </AnimatePresence>
          {notes.data?.length === 0 && <li className="text-[13px] text-muted">No notes yet.</li>}
        </ul>
      </Card>
      <AppointmentsCard patientId={patientId} appts={appts.data} reload={appts.reload} />
    </div>
  );
}

function AppointmentsCard({ patientId, appts, reload }: { patientId: string; appts?: Appointment[]; reload: () => void }) {
  const [mode, setMode] = useState<"in_person" | "video">("video");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const book = async () => {
    setBusy(true);
    try {
      const a = await api.requestAppointment(patientId, { requested_by: "doctor", mode, reason: "Follow-up consult" });
      if (when) await api.updateAppointment(a.id, { scheduled_for: new Date(when).toISOString() });
      setWhen("");
      reload();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="p-6">
      <Eyebrow icon={Video}>Appointments & consults</Eyebrow>
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-surface-2 p-3">
        <div className="flex gap-1 rounded-full border border-line bg-surface p-1">
          {(["video", "in_person"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={cx("h-8 rounded-full px-3 text-[12px]", mode === m ? "bg-ink text-bg" : "text-muted")}>{m === "video" ? "Video" : "In person"}</button>
          ))}
        </div>
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="When" className="h-10 rounded-full border border-line bg-surface px-3 text-[13px]" />
        <button type="button" onClick={book} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-[13px] font-medium text-bg hover:bg-teal disabled:opacity-50">
          <CalendarDays size={14} aria-hidden />Book
        </button>
      </div>
      {!appts ? <Skeleton className="mt-4 h-32" /> : appts.length === 0 ? <p className="mt-4 text-[13px] text-muted">No appointment requests.</p> : (
        <ul className="mt-4 space-y-2">
          {appts.map((a) => <AppointmentRow key={a.id} a={a} onChanged={reload} />)}
        </ul>
      )}
      <p className="mt-4 text-[11px] leading-relaxed text-faint">Video consults open a private Jitsi room in a new tab — both sides need the internet.</p>
    </Card>
  );
}

export function AppointmentRow({ a, onChanged, showPatient = false }: { a: Appointment; onChanged: () => void; showPatient?: boolean }) {
  const [busy, setBusy] = useState(false);
  const act = async (body: Parameters<typeof api.updateAppointment>[1]) => {
    setBusy(true);
    try {
      await api.updateAppointment(a.id, body);
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  const tone = a.status === "requested" ? "border-watch/40" : a.status === "confirmed" ? "border-teal/40" : "border-line";
  return (
    <li className={cx("rounded-2xl border p-3.5", tone)}>
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        {a.mode === "video" ? <Video size={14} className="text-violet" aria-hidden /> : <Stethoscope size={14} className="text-teal" aria-hidden />}
        {showPatient && <span className="font-medium">{a.patient_name} <span className="font-mono text-muted">{a.bed}</span></span>}
        <span className={cx("rounded-full px-2 py-0.5 text-[11px] capitalize", a.status === "requested" ? "bg-watch-soft text-watch" : a.status === "confirmed" ? "bg-teal-soft text-teal" : "bg-surface-2 text-muted")}>{a.status}</span>
        <span className="text-muted">{a.requested_by === "patient" ? "patient request" : "booked"}</span>
        <span className="ml-auto font-mono text-[11px] text-faint">{a.scheduled_for ? `${fmtDay(a.scheduled_for)} ${fmtTime(a.scheduled_for)}` : a.preferred || fmtTime(a.created_at)}</span>
      </div>
      {a.reason && <p className="mt-1.5 text-[13px] text-ink-2">{a.reason}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {a.status === "requested" && (
          <>
            <button type="button" disabled={busy} onClick={() => act({ status: "confirmed" })} className="h-8 rounded-full bg-ink px-3.5 text-[12px] font-medium text-bg hover:bg-teal disabled:opacity-50">Confirm</button>
            <button type="button" disabled={busy} onClick={() => act({ status: "declined" })} className="inline-flex h-8 items-center gap-1 rounded-full border border-line-2 px-3 text-[12px] text-muted hover:text-critical"><X size={12} aria-hidden />Decline</button>
            {a.mode !== "video" && <button type="button" disabled={busy} onClick={() => act({ mode: "video", status: "confirmed" })} className="inline-flex h-8 items-center gap-1 rounded-full border border-line-2 px-3 text-[12px] text-muted hover:text-violet"><Video size={12} aria-hidden />Make it video</button>}
          </>
        )}
        {a.status === "confirmed" && a.video_url && (
          <a href={a.video_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-violet px-3.5 text-[12px] font-medium text-white hover:opacity-90"><Video size={13} aria-hidden />Start video consult</a>
        )}
        {a.status === "confirmed" && <button type="button" disabled={busy} onClick={() => act({ status: "done" })} className="h-8 rounded-full border border-line-2 px-3 text-[12px] text-muted hover:text-stable">Mark done</button>}
      </div>
    </li>
  );
}
