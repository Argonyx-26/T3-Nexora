import { motion } from "framer-motion";
import { BellOff, ChartColumn, FlaskConical, Footprints, Moon, ScrollText, ShieldAlert, Timer, Trophy, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CountUp } from "../components/motion";
import { RaceArt } from "../components/PageArt";
import { Shell } from "../components/Shell";
import { Card, ErrorState, Eyebrow, Reveal, Skeleton, cx } from "../components/ui";
import { api, useQuery } from "../lib/api";
import type { EvalResult, Tier } from "../lib/types";

const NEWS2_COLOR = "var(--muted)";
const AYU_COLOR = "var(--teal)";
const axis = { fontSize: 11, fill: "var(--muted)", fontFamily: "var(--font-mono)" };
const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--line-2)", borderRadius: 12, fontSize: 12, fontFamily: "var(--font-mono)" };

const fmtH = (h: number | null | undefined) => (h === null || h === undefined ? "—" : `${h.toFixed(1)} h`);
const fmtLead = (h: number | null | undefined) => {
  if (h === null || h === undefined) return "—";
  const m = Math.round(h * 60);
  return m >= 90 ? `${h.toFixed(1)} h` : `${m} min`;
};

export default function Evaluation() {
  const q = useQuery((s) => api.leadTime(s), []);
  const [tier, setTier] = useState<Tier>("urgent");
  const r = q.data;

  return (
    <Shell>
      <div className="mx-auto max-w-[1400px] px-4 pt-10 pb-24 sm:px-8">
        <div className="grid items-end gap-8 lg:grid-cols-[1fr_440px]">
          <div>
            <Eyebrow icon={FlaskConical}>Evaluation · AYU vs threshold-only NEWS2</Eyebrow>
            <h1 className="mt-3 font-display text-[clamp(48px,7vw,112px)] leading-[0.9]">
              The <span className="accent text-shine">proof.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-ink-2">
              Every deterioration scenario, run on the patients it suits, over several random seeds. Each reading is scored by
              NEWS2 alone and by AYU; we note when each first escalates. The same patients are also run at rest, to count
              alarms raised for no reason.
            </p>
          </div>
          {r?.summary.urgent.lead_h_median != null && (
            <div className="rounded-3xl border border-line bg-surface/70 p-4 backdrop-blur">
              <div className="eyebrow px-2 pt-1">The race to urgent review · median</div>
              <RaceArt minutes={Math.round(r.summary.urgent.lead_h_median * 60)} className="mt-2 w-full" />
            </div>
          )}
        </div>

        {q.error && !r ? (
          <div className="mt-10"><ErrorState error={q.error} onRetry={q.reload} /></div>
        ) : !r ? (
          <Loading />
        ) : (
          <Body r={r} tier={tier} setTier={setTier} />
        )}
      </div>
    </Shell>
  );
}

function Loading() {
  return (
    <div className="mt-12">
      <div className="flex items-center gap-3 font-mono text-[12px] text-muted">
        <span className="live-dot size-1.5 rounded-full bg-teal" />
        Running the simulated deteriorations… (first load only, about ten seconds)
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-3xl" />)}</div>
      <Skeleton className="mt-6 h-80 rounded-3xl" />
    </div>
  );
}

function Body({ r, tier, setTier }: { r: EvalResult; tier: Tier; setTier: (t: Tier) => void }) {
  const s = r.summary[tier];
  const t = r.config.tiers[tier];
  const chartData = r.scenarios.map((x) => ({ name: x.label, NEWS2: x[tier].news2_h_median, AYU: x[tier].ayu_h_median, never: x[tier].news2_never, runs: x.runs }));

  return (
    <>
      {/* Tier switch */}
      <div className="mt-10 flex flex-wrap items-center gap-3">
        <div className="flex rounded-full border border-line p-1" role="group" aria-label="Comparison tier">
          {(["urgent", "first"] as Tier[]).map((k) => (
            <button key={k} type="button" onClick={() => setTier(k)} aria-pressed={tier === k}
              className={cx("h-9 rounded-full px-4 text-[13px] transition-colors duration-200", tier === k ? "bg-ink text-bg" : "text-muted hover:text-ink")}>
              {r.config.tiers[k].label}
            </button>
          ))}
        </div>
        <p className="text-[12px] text-muted">
          <span className="text-ink-2">NEWS2:</span> {t.news2} · <span className="text-ink-2">AYU:</span> {t.ayu}
        </p>
      </div>

      {/* Headline numbers */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Timer} label="Median head start" value={<CountUp key={`lead-${tier}`} value={Math.round((s.lead_h_median ?? 0) * 60)} suffix=" min" />}
          note={`AYU escalates before NEWS2 — range ${fmtLead(s.lead_h_min)} to ${fmtLead(s.lead_h_max)}`} tone="teal" />
        <Stat icon={Trophy} label="Who escalated first" value={<><CountUp key={`first-${tier}`} value={s.ayu_first} /><span className="text-[0.5em] text-muted"> / {r.summary.runs}</span></>}
          note={`AYU first · ${s.ties} tied · ${s.news2_first} NEWS2 first`} />
        <Stat icon={ShieldAlert} label="NEWS2 never escalated" value={<CountUp key={`never-${tier}`} value={s.news2_never} />}
          note={`of ${r.summary.runs} deteriorations within ${r.config.horizon_h} h; AYU missed ${s.ayu_never}`} />
        <Stat icon={BellOff} label="False alarms at rest" value={<><span className="text-teal">{s.rest_ayu_alarms}</span><span className="text-[0.5em] text-muted"> AYU · </span>{s.rest_news2_alarms}<span className="text-[0.5em] text-muted"> NEWS2</span></>}
          note={`over ${r.summary.rest_patient_days} patient-days with nothing wrong`} />
      </div>

      {/* Chart */}
      <Reveal>
        <Card className="mt-6 p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <Eyebrow icon={ChartColumn}>Hours from onset to escalation · median per scenario</Eyebrow>
            <div className="flex gap-4 text-[12px] text-muted">
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: NEWS2_COLOR }} />Threshold-only NEWS2</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: AYU_COLOR }} />AYU (baseline + trend)</span>
            </div>
          </div>
          <div className="mt-4 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 8 }} barGap={3} barCategoryGap="28%">
                <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
                <XAxis type="number" domain={[0, r.config.horizon_h]} tick={axis} axisLine={false} tickLine={false} unit=" h" />
                <YAxis type="category" dataKey="name" tick={{ ...axis, fill: "var(--ink-2)", fontFamily: "var(--font-sans)", fontSize: 12 }} axisLine={false} tickLine={false} width={150} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--surface-2)" }}
                  formatter={(v, name, item) => {
                    const p = item.payload as { never: number; runs: number };
                    return [v === null || v === undefined ? "never" : `${Number(v).toFixed(2)} h${name === "NEWS2" && p.never ? ` (never in ${p.never}/${p.runs})` : ""}`, name];
                  }} />
                <Bar dataKey="NEWS2" fill={NEWS2_COLOR} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false} />
                <Bar dataKey="AYU" fill={AYU_COLOR} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-[12px] text-muted">Shorter is earlier. Where NEWS2 never escalated in some runs, its median is over the runs where it did; the table shows how often it never did.</p>
        </Card>
      </Reveal>

      {/* Table */}
      <Reveal>
        <Card className="mt-6 overflow-x-auto p-6">
          <Eyebrow icon={ScrollText}>Per scenario · {r.config.seeds} seeds each</Eyebrow>
          <table className="mt-4 w-full min-w-[760px] text-[14px]">
            <thead>
              <tr className="text-left font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                <th className="pb-3 font-normal">Scenario</th>
                <th className="pb-3 font-normal">Patients</th>
                <th className="pb-3 text-right font-normal">NEWS2</th>
                <th className="pb-3 text-right font-normal">AYU</th>
                <th className="pb-3 text-right font-normal">Lead gained</th>
                <th className="pb-3 text-right font-normal">AYU first · tie · NEWS2 first</th>
                <th className="pb-3 text-right font-normal">NEWS2 never</th>
              </tr>
            </thead>
            <tbody>
              {r.scenarios.map((x) => {
                const v = x[tier];
                return (
                  <tr key={x.key} className="border-t border-line">
                    <td className="py-3 font-medium">{x.label}</td>
                    <td className="py-3 font-mono text-[12px] text-muted">{x.patients.join(", ")}</td>
                    <td className="py-3 text-right font-mono tnum text-muted">{fmtH(v.news2_h_median)}</td>
                    <td className="py-3 text-right font-mono tnum text-teal">{fmtH(v.ayu_h_median)}</td>
                    <td className="py-3 text-right font-mono tnum">
                      <span className="text-ink">{fmtLead(v.lead_h_median)}</span>
                      <span className="ml-2 text-[11px] text-muted">{fmtLead(v.lead_h_min)} – {fmtLead(v.lead_h_max)}</span>
                    </td>
                    <td className="py-3 text-right font-mono tnum">{v.ayu_first} · {v.ties} · {v.news2_first}</td>
                    <td className={cx("py-3 text-right font-mono tnum", v.news2_never ? "text-warning" : "text-muted")}>{v.news2_never}/{x.runs}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </Reveal>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
        <Reveal><Example r={r} /></Reveal>
        <Reveal><Rest r={r} tier={tier} /></Reveal>
      </div>

      <Reveal>
        <Card className="mt-6 p-6">
          <Eyebrow icon={ShieldAlert}>Method and limits</Eyebrow>
          <ul className="mt-4 grid gap-3 text-[14px] leading-relaxed text-ink-2 md:grid-cols-2">
            <li>Each run: 7 days of the patient's own normal readings, then the scenario, stepped every {r.config.minutes_per_tick} minutes for {r.config.horizon_h} hours — the same generator and scenario definitions as the live ward.</li>
            <li>Two tiers compare like with like: urgent review (NEWS2 ≥ 5 vs AYU Warning), and each system's own first alert (NEWS2 ≥ 5 or a single 3 vs AYU Watch confirmed on the next reading).</li>
            <li>AYU can never be later than NEWS2 at the urgent tier: its escalation floors lift it to Warning on the reading NEWS2 reaches 5. Ties are shown, not hidden.</li>
            <li>Symptoms reported during a scenario count for AYU only — NEWS2 uses vital signs by design. Missed insulin is invisible to NEWS2 until the vitals follow.</li>
            <li>At rest, each patient runs {r.config.rest_hours_per_seed} h per seed; an alarm is counted each time a rule switches on.</li>
            <li><span className="text-ink">Synthetic data, not clinical validation.</span> The numbers show the method works on realistic simulated physiology; a prospective study on real wards is the next step.</li>
          </ul>
        </Card>
      </Reveal>
    </>
  );
}

function Stat({ label, value, note, tone, icon: Icon }: { label: string; value: React.ReactNode; note: string; tone?: "teal"; icon: LucideIcon }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="group relative overflow-hidden rounded-3xl border border-line bg-surface p-6 transition-colors hover:border-line-2">
      <Icon size={72} strokeWidth={1} aria-hidden className="pointer-events-none absolute -right-3 -bottom-3 text-teal opacity-[0.07] transition-all duration-700 group-hover:-rotate-6 group-hover:opacity-[0.14]" />
      <div className="eyebrow flex items-center gap-2"><Icon size={13} strokeWidth={1.75} aria-hidden />{label}</div>
      <div className={cx("mt-3 font-display text-[clamp(40px,4vw,60px)] leading-none tnum", tone === "teal" && "text-teal")}>{value}</div>
      <p className="mt-3 text-[13px] leading-relaxed text-muted">{note}</p>
    </motion.div>
  );
}

function Example({ r }: { r: EvalResult }) {
  const pts = r.example.points;
  const ayuAt = pts.find((p) => p.ayu >= 50)?.h;
  const newsAt = pts.find((p) => p.news2 >= 5)?.h;
  return (
    <Card className="p-6">
      <Eyebrow icon={Footprints}>One run · {r.example.patient_name}, sepsis</Eyebrow>
      <p className="mt-2 text-[13px] text-muted">Same patient, same readings, two scores. Dashed lines mark each one's urgent threshold.</p>
      <div className="mt-4 text-[12px] font-mono text-teal">AYU score (Warning at 50)</div>
      <div className="h-[150px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={pts} margin={{ top: 6, right: 12, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="h" type="number" domain={[0, r.config.horizon_h]} tick={axis} axisLine={false} tickLine={false} unit="h" />
            <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={axis} axisLine={false} tickLine={false} />
            <ReferenceLine y={50} stroke="var(--line-2)" strokeDasharray="3 4" />
            {ayuAt !== undefined && <ReferenceLine x={ayuAt} stroke={AYU_COLOR} strokeDasharray="2 3" />}
            <Tooltip contentStyle={tooltipStyle} labelFormatter={(h) => `${Number(h).toFixed(2)} h`} />
            <Line dataKey="ayu" name="AYU" stroke={AYU_COLOR} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 text-[12px] font-mono text-muted">NEWS2 (urgent at 5)</div>
      <div className="h-[130px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={pts} margin={{ top: 6, right: 12, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="h" type="number" domain={[0, r.config.horizon_h]} tick={axis} axisLine={false} tickLine={false} unit="h" />
            <YAxis domain={[0, 12]} ticks={[0, 5, 10]} tick={axis} axisLine={false} tickLine={false} />
            <ReferenceLine y={5} stroke="var(--line-2)" strokeDasharray="3 4" />
            {ayuAt !== undefined && <ReferenceLine x={ayuAt} stroke={AYU_COLOR} strokeDasharray="2 3" />}
            <Tooltip contentStyle={tooltipStyle} labelFormatter={(h) => `${Number(h).toFixed(2)} h`} />
            <Line dataKey="news2" name="NEWS2" stroke={NEWS2_COLOR} strokeWidth={2} dot={false} type="stepAfter" isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {ayuAt !== undefined && (
        <p className="mt-3 text-[13px] text-ink-2">
          AYU reached Warning at <span className="font-mono text-teal">{ayuAt.toFixed(2)} h</span>; NEWS2 reached 5 at{" "}
          <span className="font-mono">{newsAt !== undefined ? `${newsAt.toFixed(2)} h` : "never"}</span>
          {newsAt !== undefined && <> — <span className="text-teal">{fmtLead(newsAt - ayuAt)} earlier</span></>}.
        </p>
      )}
    </Card>
  );
}

function Rest({ r, tier }: { r: EvalResult; tier: Tier }) {
  const rows = r.rest.filter((x) => x[tier].ayu || x[tier].news2);
  const s = r.summary[tier];
  return (
    <Card className="h-full p-6">
      <Eyebrow icon={Moon}>At rest · nothing wrong</Eyebrow>
      <p className="mt-2 text-[13px] text-muted">{r.summary.rest_patient_days} patient-days with no scenario. Every alarm here is a false one.</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-teal-soft p-4">
          <div className="text-[12px] text-teal">AYU</div>
          <div className="mt-1 font-display text-[44px] leading-none text-teal">{s.rest_ayu_alarms}</div>
        </div>
        <div className="rounded-2xl bg-surface-2 p-4">
          <div className="text-[12px] text-muted">NEWS2</div>
          <div className="mt-1 font-display text-[44px] leading-none">{s.rest_news2_alarms}</div>
        </div>
      </div>
      {rows.length > 0 ? (
        <table className="mt-5 w-full text-[13px]">
          <tbody>
            {rows.map((x) => (
              <tr key={x.patient_id} className="border-t border-line">
                <td className="py-2">{x.patient_name}</td>
                <td className="py-2 text-right font-mono text-teal">{x[tier].ayu}</td>
                <td className="py-2 text-right font-mono text-muted">{x[tier].news2}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-5 text-[13px] text-muted">No false alarms from either method at this tier.</p>
      )}
      <p className="mt-4 text-[12px] leading-relaxed text-muted">
        Where alarms appear, it is patients whose own normal sits on NEWS2's thresholds (heart failure, COPD) — exactly
        where one-size-fits-all scoring struggles.
      </p>
    </Card>
  );
}
