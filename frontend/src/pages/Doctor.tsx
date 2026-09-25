import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { BellRing, Search, Siren, TriangleAlert, Users, type LucideIcon } from "lucide-react";
import { forwardRef, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertToaster, AlertsPanel, LiveStatus } from "../components/alerts";
import { Shell } from "../components/Shell";
import { Sparkline } from "../components/Sparkline";
import { spotlight } from "../components/motion";
import { VITAL_ICON, ic } from "../components/icons";
import { EmptyState, ErrorState, Eyebrow, LevelDot, RiskBadge, Skeleton, cx } from "../components/ui";
import { api, useQuery } from "../lib/api";
import { useLive } from "../lib/live";
import { LEVELS, LEVEL_STYLE, fmtVital } from "../lib/format";
import type { Level, PatientSummary, Vital, VitalKey } from "../lib/types";

const RANK: Record<Level, number> = { Stable: 0, Watch: 1, Warning: 2, Critical: 3 };
const POLL_MS = 30_000; // static details; live values come over the WebSocket
const SPARK: { key: VitalKey; label: string }[] = [
  { key: "hr", label: "HR" },
  { key: "spo2", label: "SpO₂" },
  { key: "sbp", label: "SBP" },
];

function headline(ps: PatientSummary[]) {
  const n = (l: Level) => ps.filter((p) => p.risk.level === l).length;
  if (n("Critical")) return { lead: `${n("Critical")} ${n("Critical") === 1 ? "patient needs" : "patients need"} you`, tail: "now.", level: "Critical" as Level };
  if (n("Warning")) return { lead: `${n("Warning")} to review`, tail: "within the hour.", level: "Warning" as Level };
  if (n("Watch")) return { lead: `${n("Watch")} on closer`, tail: "watch.", level: "Watch" as Level };
  return { lead: "The ward is", tail: "steady.", level: "Stable" as Level };
}

export default function Doctor() {
  const patients = useQuery((s) => api.patients(s), [], POLL_MS);
  const ids = patients.data?.map((p) => p.id).sort().join(",") ?? "";
  const vitals = useQuery(
    async (s) => {
      if (!ids) return {} as Record<string, Vital[]>;
      const list = ids.split(",");
      const rows = await Promise.all(list.map((id) => api.vitals(id, "6h", 36, s).catch(() => [] as Vital[])));
      return Object.fromEntries(list.map((id, i) => [id, rows[i]])) as Record<string, Vital[]>;
    },
    [ids],
    POLL_MS * 3,
  );

  const [filter, setFilter] = useState<Level | "All">("All");
  const [q, setQ] = useState("");

  const live = useLive();
  // Static details from REST, live risk and vitals from the stream, highest score first.
  const list = useMemo(() => {
    const base = patients.data ?? [];
    return base
      .map((p) => {
        const u = live.patients[p.id];
        return u ? { ...p, risk: u.risk, latest: u.vitals } : p;
      })
      // Risky patients by score; Stable ones hold their bed order so tiny score jitter can't reshuffle the ward.
      .sort((a, b) => {
        const ka = RANK[a.risk.level] * 1000 + (a.risk.level === "Stable" ? 0 : a.risk.score);
        const kb = RANK[b.risk.level] * 1000 + (b.risk.level === "Stable" ? 0 : b.risk.score);
        return kb - ka || a.bed.localeCompare(b.bed);
      });
  }, [patients.data, live.patients]);
  const series = (id: string) => {
    const rest = vitals.data?.[id];
    if (!rest) return undefined;
    const lastTs = rest.length ? rest[rest.length - 1].ts : "";
    return [...rest, ...(live.trail[id] ?? []).filter((v) => v.ts > lastTs)].slice(-36);
  };
  const counts = useMemo(() => Object.fromEntries(LEVELS.map((l) => [l, list.filter((p) => p.risk.level === l).length])) as Record<Level, number>, [list]);
  const shown = list.filter(
    (p) => (filter === "All" || p.risk.level === filter) && (!q || `${p.name} ${p.bed} ${p.conditions.join(" ")}`.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <Shell status={<LiveStatus />}>
      <AlertToaster />
      <div className="mx-auto max-w-[1400px] px-4 pt-10 pb-20 sm:px-8">
        {/* Heading */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Eyebrow>Ward overview · all beds</Eyebrow>
            {patients.data ? (
              <motion.h1
                key={headline(list).lead}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="mt-3 font-display text-[clamp(40px,5vw,72px)] leading-[1] tracking-[-0.02em]"
              >
                {headline(list).lead} <span className={cx("accent", LEVEL_STYLE[headline(list).level].text)}>{headline(list).tail}</span>
              </motion.h1>
            ) : (
              <Skeleton className="mt-3 h-16 w-[420px] max-w-full" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Patients" icon={Users} value={list.length} loading={!patients.data} />
            <Kpi label="Critical" icon={Siren} value={counts.Critical ?? 0} level="Critical" loading={!patients.data} />
            <Kpi label="Warning" icon={TriangleAlert} value={counts.Warning ?? 0} level="Warning" loading={!patients.data} />
            <Kpi label="Open alerts" icon={BellRing} value={live.alerts.length} level={live.alerts.some((a) => a.status === "new") ? "Critical" : undefined} loading={!patients.data} />
          </div>
        </div>

        {/* Controls */}
        <div className="mt-12 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by risk level">
            {(["All", ...[...LEVELS].reverse()] as const).map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={filter === l}
                onClick={() => setFilter(l)}
                className={cx(
                  "relative h-9 rounded-full px-4 text-[13px] transition-colors",
                  filter === l ? "text-bg" : "text-muted hover:text-ink",
                )}
              >
                {filter === l && <motion.span layoutId="filter-pill" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                <span className="relative inline-flex items-center gap-2">
                  {l !== "All" && <LevelDot level={l} />}
                  {l}
                  <span className="font-mono text-[11px] opacity-60 tnum">{l === "All" ? list.length : counts[l] ?? 0}</span>
                </span>
              </button>
            ))}
          </div>
          <label className="relative block w-full sm:w-72">
            <Search {...ic(15)} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, bed or condition"
              aria-label="Search patients"
              className="h-10 w-full rounded-full border border-line bg-surface pr-4 pl-10 text-[14px] outline-none transition-colors placeholder:text-faint focus:border-line-2"
            />
          </label>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
          {/* Patient grid */}
          <div>
            {patients.error && !patients.data ? (
              <ErrorState error={patients.error} onRetry={patients.reload} />
            ) : !patients.data ? (
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[248px] rounded-3xl" />)}
              </div>
            ) : shown.length === 0 ? (
              <EmptyState title="No patients match">Try another level or clear the search.</EmptyState>
            ) : (
              <LayoutGroup>
                <motion.div layout className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  <AnimatePresence mode="popLayout">
                    {shown.map((p, i) => (
                      <PatientCard key={p.id} p={p} vitals={series(p.id)} index={i} />
                    ))}
                  </AnimatePresence>
                </motion.div>
              </LayoutGroup>
            )}
          </div>

          {/* Alerts */}
          <aside className="xl:sticky xl:top-24 xl:max-h-[calc(100dvh-7rem)] xl:self-start xl:overflow-y-auto">
            <AlertsPanel />
          </aside>
        </div>
      </div>
    </Shell>
  );
}

function Kpi({ label, value, level, loading, icon: Icon }: { label: string; value: number; level?: Level; loading?: boolean; icon: LucideIcon }) {
  return (
    <div className="group relative min-w-[132px] overflow-hidden rounded-2xl border border-line bg-surface px-4 py-3 transition-colors hover:border-line-2">
      <Icon {...ic(40)} strokeWidth={1.25} className={cx("pointer-events-none absolute -right-2 -bottom-2 opacity-[0.07] transition-all duration-500 group-hover:scale-110 group-hover:opacity-[0.12]", level && value > 0 && LEVEL_STYLE[level].text)} />
      <div className="eyebrow flex items-center gap-2 whitespace-nowrap">
        {level && <LevelDot level={level} className={value === 0 ? "opacity-30" : ""} />}
        {label}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-10" />
      ) : (
        <motion.div key={value} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cx("mt-1 font-display text-[36px] leading-none tnum", level && value > 0 && LEVEL_STYLE[level].text)}>
          {value}
        </motion.div>
      )}
    </div>
  );
}

const PatientCard = forwardRef<HTMLDivElement, { p: PatientSummary; vitals?: Vital[]; index: number }>(function PatientCard({ p, vitals, index }, ref) {
  const s = LEVEL_STYLE[p.risk.level];
  const critical = p.risk.level === "Critical";
  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.5, delay: Math.min(index, 8) * 0.04, ease: [0.22, 1, 0.36, 1], layout: { type: "spring", stiffness: 260, damping: 30 } }}
    >
      <Link
        to={`/patients/${p.id}`}
        onPointerMove={spotlight}
        className={cx(
          "spotlight group relative block overflow-hidden rounded-3xl border bg-surface p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-line-2",
          p.risk.level === "Stable" ? "border-line" : s.border,
          critical && "pulse-critical",
        )}
      >
        <span className={cx("absolute inset-x-0 top-0 h-[3px]", s.dot, p.risk.level === "Stable" && "opacity-0")} />
        {/* a brief wash of the new level's colour whenever the level changes */}
        <motion.span
          key={p.risk.level}
          aria-hidden
          className={cx("pointer-events-none absolute inset-0 -z-10", s.soft)}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.6, ease: "easeOut" }}
        />
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="truncate text-[16px] font-medium">{p.name}</div>
            <div className="mt-0.5 font-mono text-[11px] tracking-wide text-muted">
              {p.age} · {p.sex} · {p.bed}
            </div>
          </div>
          <div className="text-right">
            <motion.div key={p.risk.score} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className={cx("font-display text-[40px] leading-none", s.text)}>
              {p.risk.score}
            </motion.div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <RiskBadge level={p.risk.level} size="sm" />
          {p.conditions.slice(0, 2).map((c) => (
            <span key={c} className="truncate rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] text-ink-2">{c}</span>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          {SPARK.map(({ key, label }) => {
            const series = vitals?.map((v) => v[key] as number) ?? [];
            const n = p.normals[key];
            const Icon = VITAL_ICON[key];
            return (
              <div key={key}>
                <div className="flex items-baseline justify-between">
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.1em] text-muted">
                    <Icon {...ic(12)} />
                    {label}
                  </span>
                  <span className="font-mono text-[13px] tnum">{fmtVital(key, p.latest[key] as number)}</span>
                </div>
                <div className="mt-1.5">
                  {vitals ? (
                    <Sparkline values={series} band={n ? { low: n.mean - 2.5 * n.std, high: n.mean + 2.5 * n.std } : undefined} color={p.risk.level === "Stable" ? "var(--teal)" : s.hex} />
                  ) : (
                    <Skeleton className="h-7" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 border-t border-line pt-3">
          <div className="eyebrow">Why</div>
          <div className="mt-1 line-clamp-1 text-[13px] text-ink-2">{p.risk.summary}</div>
        </div>
      </Link>
    </motion.div>
  );
});
