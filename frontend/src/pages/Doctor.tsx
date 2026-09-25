import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { forwardRef, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Shell, SyncStatus } from "../components/Shell";
import { Sparkline } from "../components/Sparkline";
import { spotlight } from "../components/motion";
import { Card, EmptyState, ErrorState, Eyebrow, LevelDot, RiskBadge, Skeleton, cx } from "../components/ui";
import { api, useQuery } from "../lib/api";
import { LEVELS, LEVEL_STYLE, fmtVital } from "../lib/format";
import type { Level, PatientSummary, Vital, VitalKey } from "../lib/types";

const POLL_MS = 10_000;
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

  const list = patients.data ?? [];
  const counts = useMemo(() => Object.fromEntries(LEVELS.map((l) => [l, list.filter((p) => p.risk.level === l).length])) as Record<Level, number>, [list]);
  const shown = list.filter(
    (p) => (filter === "All" || p.risk.level === filter) && (!q || `${p.name} ${p.bed} ${p.conditions.join(" ")}`.toLowerCase().includes(q.toLowerCase())),
  );
  const attention = list.filter((p) => p.risk.level !== "Stable");

  return (
    <Shell status={<SyncStatus at={patients.refreshedAt} error={patients.error} />}>
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
            <Kpi label="Patients" value={list.length} loading={!patients.data} />
            <Kpi label="Critical" value={counts.Critical ?? 0} level="Critical" loading={!patients.data} />
            <Kpi label="Warning" value={counts.Warning ?? 0} level="Warning" loading={!patients.data} />
            <Kpi label="Watch" value={counts.Watch ?? 0} level="Watch" loading={!patients.data} />
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
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, bed or condition"
            aria-label="Search patients"
            className="h-10 w-full rounded-full border border-line bg-surface px-4 text-[14px] outline-none transition-colors placeholder:text-faint focus:border-line-2 sm:w-72"
          />
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
                      <PatientCard key={p.id} p={p} vitals={vitals.data?.[p.id]} index={i} />
                    ))}
                  </AnimatePresence>
                </motion.div>
              </LayoutGroup>
            )}
          </div>

          {/* Attention queue */}
          <aside className="xl:sticky xl:top-24 xl:self-start">
            <Card className="p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-[26px] leading-none">Attention</h2>
                <span className="font-mono text-[12px] text-muted tnum">{attention.length} open</span>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">Patients above Stable, highest risk first.</p>
              <div className="mt-5 space-y-2">
                {!patients.data ? (
                  Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)
                ) : attention.length === 0 ? (
                  <EmptyState title="All quiet">Nobody is above Stable. Anyone who rises will appear here first.</EmptyState>
                ) : (
                  <AnimatePresence initial={false}>
                    {attention.map((p) => (
                      <motion.div key={p.id} layout initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
                        <Link
                          to={`/patients/${p.id}`}
                          className={cx("block rounded-2xl border-l-2 px-4 py-3 transition-colors hover:bg-surface-2", LEVEL_STYLE[p.risk.level].border)}
                          style={{ borderLeftColor: LEVEL_STYLE[p.risk.level].hex }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-[14px] font-medium">{p.name}</span>
                            <span className={cx("font-mono text-[13px] tnum", LEVEL_STYLE[p.risk.level].text)}>{p.risk.score}</span>
                          </div>
                          <div className="mt-0.5 truncate text-[12px] text-muted">{p.risk.summary}</div>
                        </Link>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </Shell>
  );
}

function Kpi({ label, value, level, loading }: { label: string; value: number; level?: Level; loading?: boolean }) {
  return (
    <div className="min-w-[120px] rounded-2xl border border-line bg-surface px-4 py-3">
      <div className="eyebrow flex items-center gap-2">
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
            return (
              <div key={key}>
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[10px] tracking-[0.1em] text-muted">{label}</span>
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
