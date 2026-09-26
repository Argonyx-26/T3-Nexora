import { AnimatePresence, motion } from "framer-motion";
import { Activity, ArrowRight, CalendarDays, Check, Pill, Repeat, ShieldCheck, Siren, TrendingDown, Zap } from "lucide-react";
import { forwardRef, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertToaster, LiveStatus } from "../components/alerts";
import { AppointmentRow, ChangeRow, ConfidenceBadge, PRIORITY_STYLE } from "../components/DoctorKit";
import { Shell } from "../components/Shell";
import { ScopeBar } from "../components/NetworkKit";
import { inScope, useScope } from "../lib/scope";
import { EmptyState, ErrorState, Eyebrow, Skeleton, cx } from "../components/ui";
import { api, useQuery } from "../lib/api";
import { useLive } from "../lib/live";
import type { Priority, QueueItem } from "../lib/types";

/*
 * The AI risk & smart-alert command center: every patient AYU wants a doctor to look at,
 * Critical → High → Moderate, each with its confidence, data quality, the factors behind it,
 * any sudden vital change and any missed-dose or mood pattern — plus the ward's sudden
 * changes and appointment requests beside it.
 */

const FILTERS: ("All" | Priority)[] = ["All", "Critical", "High", "Moderate"];

export default function CommandCenter() {
  const queue = useQuery((s) => api.queue(s), [], 20_000);
  const appts = useQuery((s) => api.wardAppointments("requested", s), [], 30_000);
  const [filter, setFilter] = useState<"All" | Priority>("All");

  // Follow the live ward, a few seconds apart so 20× speed stays smooth.
  const live = useLive();
  const last = useRef(0);
  useEffect(() => {
    if (Date.now() - last.current < 4000) return;
    last.current = Date.now();
    queue.reload();
  }, [live.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  const [scope] = useScope();
  const scoped = (queue.data ?? []).filter((q) => inScope(scope, q));
  const items = scoped.filter((q) => q.priority);
  const count = (p: Priority) => items.filter((q) => q.priority === p).length;
  const shown = items.filter((q) => filter === "All" || q.priority === filter);
  const sudden = scoped.flatMap((q) => q.sudden_changes.map((c) => ({ q, c })));
  const patterns = scoped.flatMap((q) => [
    ...q.missed_patterns.filter((m) => m.kind !== "time").map((m) => ({ q, text: m.text, icon: m.kind === "critical" ? Siren : Repeat, tab: "meds" })),
    ...q.mood_changes.map((m) => ({ q, text: m.text, icon: TrendingDown, tab: "overview" })),
  ]);
  const top = items[0]?.priority;

  return (
    <Shell status={<LiveStatus />}>
      <AlertToaster />
      <div className="mx-auto max-w-[1400px] px-4 pt-10 pb-20 sm:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Eyebrow icon={Zap}>AI risk & smart-alert command center</Eyebrow>
            {queue.data ? (
              <motion.h1 key={items.length} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="mt-3 font-display text-[clamp(40px,5vw,72px)] leading-none">
                {items.length === 0 ? <>All <span className="accent text-stable">clear.</span></> : (
                  <>{items.length} to <span className={cx("accent", top ? PRIORITY_STYLE[top].text : "text-teal")}>review.</span></>
                )}
              </motion.h1>
            ) : <Skeleton className="mt-3 h-16 w-80" />}
            <p className="mt-3 max-w-xl text-[14px] text-muted">
              Critical = AYU Critical · High = AYU Warning · Moderate = AYU Watch, or a stable patient with a sudden change or a pattern worth a look.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {(["Critical", "High", "Moderate"] as Priority[]).map((p) => {
              const S = PRIORITY_STYLE[p];
              return (
                <div key={p} className="rounded-2xl border border-line bg-surface px-4 py-3">
                  <div className={cx("eyebrow flex items-center gap-1.5 whitespace-nowrap", count(p) > 0 && S.text)}><S.icon size={12} aria-hidden />{p}</div>
                  <div className={cx("mt-1 font-display text-[32px] leading-none tnum", count(p) > 0 && S.text)}>{queue.data ? count(p) : "—"}</div>
                </div>
              );
            })}
            <div className="rounded-2xl border border-line bg-surface px-4 py-3">
              <div className="eyebrow flex items-center gap-1.5 whitespace-nowrap"><Activity size={12} aria-hidden />Sudden</div>
              <div className="mt-1 font-display text-[32px] leading-none tnum">{queue.data ? sudden.length : "—"}</div>
            </div>
            <div className="rounded-2xl border border-line bg-surface px-4 py-3">
              <div className="eyebrow flex items-center gap-1.5 whitespace-nowrap"><CalendarDays size={12} aria-hidden />Requests</div>
              <div className="mt-1 font-display text-[32px] leading-none tnum">{appts.data ? appts.data.length : "—"}</div>
            </div>
          </div>
        </div>

        <ScopeBar className="mt-8" />
        <div className="mt-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by priority">
          {FILTERS.map((f) => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
              className={cx("inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] transition-colors", filter === f ? "bg-ink text-bg" : "text-muted hover:text-ink")}>
              {f !== "All" && <span className={cx("size-2 rounded-full", PRIORITY_STYLE[f].dot)} />}
              {f}
              <span className="font-mono text-[11px] opacity-60">{f === "All" ? items.length : count(f)}</span>
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px] [&>*]:min-w-0">
          <div>
            {queue.error && !queue.data ? <ErrorState error={queue.error} onRetry={queue.reload} /> : !queue.data ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-3xl" />)}</div>
            ) : shown.length === 0 ? (
              <EmptyState title="Nothing to review" icon={ShieldCheck}>AYU is watching every bed. New alerts, sudden changes and patterns land here first.</EmptyState>
            ) : (
              <ul className="space-y-3">
                <AnimatePresence mode="popLayout" initial={false}>
                  {shown.map((q, i) => <QueueCard key={q.patient_id} q={q} i={i} onChanged={queue.reload} />)}
                </AnimatePresence>
              </ul>
            )}
          </div>

          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <section className="rounded-3xl border border-line bg-surface p-5">
              <Eyebrow icon={Activity}>Sudden vital changes</Eyebrow>
              {!queue.data ? <Skeleton className="mt-4 h-24" /> : sudden.length === 0 ? (
                <p className="mt-3 text-[13px] text-muted">No sharp change in BP, SpO₂, heart rate, temperature or breathing in the last hour.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {sudden.map(({ q, c }) => (
                    <div key={`${q.patient_id}-${c.vital}`}>
                      <Link to={`/patients/${q.patient_id}?tab=trends`} className="mb-1 block text-[12px] text-muted hover:text-ink">{q.name} · {q.bed}</Link>
                      <ChangeRow c={c} />
                    </div>
                  ))}
                </ul>
              )}
            </section>
            <section className="rounded-3xl border border-line bg-surface p-5">
              <Eyebrow icon={CalendarDays}>Appointment requests</Eyebrow>
              {!appts.data ? <Skeleton className="mt-4 h-20" /> : appts.data.length === 0 ? (
                <p className="mt-3 text-[13px] text-muted">No pending requests.</p>
              ) : (
                <ul className="mt-3 space-y-2">{appts.data.map((a) => <AppointmentRow key={a.id} a={a} onChanged={appts.reload} showPatient />)}</ul>
              )}
            </section>
            <section className="rounded-3xl border border-line bg-surface p-5">
              <Eyebrow icon={Repeat}>Patterns to review</Eyebrow>
              {!queue.data ? <Skeleton className="mt-4 h-20" /> : patterns.length === 0 ? (
                <p className="mt-3 text-[13px] text-muted">No recurring missed doses or mood drops.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {patterns.map(({ q, text, icon: Icon, tab }) => (
                    <li key={`${q.patient_id}-${text}`}>
                      <Link to={`/patients/${q.patient_id}?tab=${tab}`} className="group flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] transition-colors hover:bg-watch-soft">
                        <Icon size={15} className="mt-0.5 shrink-0 text-watch" aria-hidden />
                        <span><span className="font-medium">{q.name}</span> — {text}</span>
                        <ArrowRight size={14} className="mt-0.5 ml-auto shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </Shell>
  );
}

const QueueCard = forwardRef<HTMLLIElement, { q: QueueItem; i: number; onChanged: () => void }>(function QueueCard({ q, i, onChanged }, ref) {
  const P = PRIORITY_STYLE[q.priority!];
  const [busy, setBusy] = useState(false);
  const total = Math.max(1, q.factors.reduce((s, f) => s + f.contribution, 0));
  const ack = async () => {
    if (!q.alert) return;
    setBusy(true);
    try {
      await api.ack(q.alert.id, "Reviewed from the command center");
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  return (
    <motion.li
      ref={ref}
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.4, delay: Math.min(i, 6) * 0.04, layout: { type: "spring", stiffness: 260, damping: 30 } }}
      className={cx("relative overflow-hidden rounded-3xl border bg-surface p-5", P.border, q.priority === "Critical" && "pulse-critical")}
    >
      <span className={cx("absolute inset-y-0 left-0 w-1", P.dot)} />
      <div className="flex flex-wrap items-start gap-3">
        <span className={cx("grid size-10 shrink-0 place-items-center rounded-full", P.soft, P.text)}><P.icon size={18} aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cx("text-[12px] font-semibold uppercase tracking-wide", P.text)}>{q.priority}</span>
            <Link to={`/patients/${q.patient_id}`} className="text-[17px] font-medium hover:underline">{q.name}</Link>
            <span className="font-mono text-[11px] text-muted">{q.bed} · {q.ward}</span>
            {q.alert && (
              <span className={cx("rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide", q.alert.status === "new" ? cx(P.soft, P.text) : "bg-surface-2 text-muted")}>
                {q.alert.status === "new" ? "New alert" : `Seen · ${q.alert.acknowledged_by || "Doctor"}`}
              </span>
            )}
          </div>
          <div className="mt-2">
            <ConfidenceBadge level={q.level} confidence={q.confidence} quality={q.data_quality} size="sm" />
            <span className="ml-2 font-mono text-[11px] text-muted">AYU {q.score} · NEWS2 {q.news2}</span>
          </div>
        </div>
        <div className="flex gap-1.5">
          {q.alert?.status === "new" && (
            <button type="button" onClick={ack} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-3.5 text-[12px] font-medium text-bg hover:bg-teal disabled:opacity-50">
              <Check size={13} aria-hidden />Acknowledge
            </button>
          )}
          <Link to={`/patients/${q.patient_id}`} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-2 px-3.5 text-[12px] hover:border-ink">
            Open <ArrowRight size={13} aria-hidden />
          </Link>
        </div>
      </div>

      {q.factors.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] tracking-wide text-muted uppercase">Main factors</div>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface-2">
            {q.factors.map((f, j) => (
              <motion.span key={f.factor} className={cx("h-full", j === 0 ? "bg-teal" : j === 1 ? "bg-sky" : j === 2 ? "bg-violet" : "bg-line-2")}
                initial={{ width: 0 }} animate={{ width: `${(f.contribution / total) * 100}%` }} transition={{ duration: 0.7, delay: j * 0.08 }} />
            ))}
          </div>
          <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {q.factors.slice(0, 4).map((f, j) => (
              <li key={f.factor} className="flex items-center gap-2 text-[13px] text-ink-2">
                <span className={cx("size-2 shrink-0 rounded-full", j === 0 ? "bg-teal" : j === 1 ? "bg-sky" : j === 2 ? "bg-violet" : "bg-line-2")} />
                <span className="truncate">{f.headline}</span>
                <span className="ml-auto font-mono text-[11px] text-muted">+{f.contribution.toFixed(1)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(q.sudden_changes.length > 0 || q.missed_patterns.length > 0 || q.mood_changes.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {q.sudden_changes.map((c) => (
            <span key={c.vital} className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px]", c.severity === "High" ? "bg-critical-soft text-critical" : "bg-watch-soft text-watch")}>
              <Activity size={12} aria-hidden />{c.label} {c.from ?? "—"} → {c.to}
            </span>
          ))}
          {q.missed_patterns.map((m) => (
            <Link key={m.text} to={`/patients/${q.patient_id}?tab=meds`} className="inline-flex items-center gap-1 rounded-full bg-watch-soft px-2.5 py-1 text-[12px] text-watch hover:underline">
              <Pill size={12} aria-hidden />{m.text}
            </Link>
          ))}
          {q.mood_changes.map((m) => (
            <span key={m.text} className="inline-flex items-center gap-1 rounded-full bg-violet-soft px-2.5 py-1 text-[12px] text-violet"><TrendingDown size={12} aria-hidden />{m.text}</span>
          ))}
        </div>
      )}
    </motion.li>
  );
});
