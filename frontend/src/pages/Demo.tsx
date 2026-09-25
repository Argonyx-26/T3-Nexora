import { useState } from "react";
import { AlertToaster, LiveStatus } from "../components/alerts";
import { Shell } from "../components/Shell";
import { EmptyState, ErrorState, Eyebrow, LevelDot, Skeleton, cx } from "../components/ui";
import { api, useQuery } from "../lib/api";
import { LEVEL_STYLE, fmtTime } from "../lib/format";
import { useLive } from "../lib/live";

const SPEEDS = [1, 5, 20];
const QUICK_SYMPTOMS: [string, string][] = [
  ["chest_pain", "Chest pain"],
  ["breathlessness", "Breathlessness"],
  ["confusion", "New confusion"],
  ["severe_headache", "Severe headache"],
];

/** Stage controls: pick a patient, inject a scenario, set speed, reset. Hidden route: /demo */
export default function Demo() {
  const live = useLive();
  const patients = useQuery((s) => api.patients(s), [], 30_000);
  const scenarios = useQuery((s) => api.scenarios(s), []);
  const [selected, setSelected] = useState("P006");
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [confirmReset, setConfirmReset] = useState(false);
  const [done, setDone] = useState<string>();

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(undefined);
    try {
      await fn();
      setDone(label);
      setTimeout(() => setDone((d) => (d === label ? undefined : d)), 1800);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  };

  const sim = live.sim;
  const list = (patients.data ?? []).map((p) => ({ ...p, live: live.patients[p.id] }));
  const current = list.find((p) => p.id === selected);
  const active = sim?.scenarios[selected];

  return (
    <Shell status={<LiveStatus />}>
      <AlertToaster />
      <div className="mx-auto max-w-[1400px] px-4 pt-10 pb-20 sm:px-8">
        <Eyebrow>Demo control panel · for the stage</Eyebrow>
        <div className="mt-3 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <h1 className="font-display text-[clamp(40px,5vw,72px)] leading-none">
            Run the <span className="accent text-teal">ward.</span>
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-line bg-surface px-4 py-2.5">
              <div className="eyebrow">Simulated time</div>
              <div className="font-mono text-[24px] leading-none tnum">{sim ? fmtTime(sim.sim_time) : "—"}<span className="ml-1 text-[12px] text-muted">IST</span></div>
            </div>
            <div className="flex rounded-full border border-line p-1" role="group" aria-label="Speed">
              {SPEEDS.map((sp) => (
                <button
                  key={sp}
                  type="button"
                  onClick={() => run(`speed ${sp}`, () => api.setSpeed(sp))}
                  className={cx("h-10 rounded-full px-5 font-mono text-[13px] transition-colors duration-200", sim?.speed === sp ? "bg-ink text-bg" : "text-muted hover:text-ink")}
                >
                  {sp}×
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => run("pause", () => (sim?.paused ? api.resume() : api.pause()))}
              className="h-12 rounded-full border border-line-2 px-5 text-[14px] font-medium hover:border-ink"
            >
              {sim?.paused ? "Resume" : "Pause"}
            </button>
            <button type="button" onClick={() => run("step", () => api.step())} className="h-12 rounded-full border border-line px-5 text-[14px] text-muted hover:text-ink">
              +5 min
            </button>
            {confirmReset ? (
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => run("reset", async () => { await api.reset(); setConfirmReset(false); })}
                  className="h-12 rounded-full bg-critical px-5 text-[14px] font-medium text-white"
                >
                  {busy === "reset" ? "Resetting…" : "Yes, reset everything"}
                </button>
                <button type="button" onClick={() => setConfirmReset(false)} className="h-12 px-3 text-[13px] text-muted hover:text-ink">Cancel</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmReset(true)} className="h-12 rounded-full border border-critical/40 px-5 text-[14px] text-critical hover:bg-critical-soft">
                Reset
              </button>
            )}
          </div>
        </div>
        {error && <p className="mt-4 text-[13px] text-critical">{error}</p>}
        {done && !error && <p className="mt-4 font-mono text-[12px] text-stable">Done: {done}</p>}

        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_420px] [&>*]:min-w-0">
          {/* Patients */}
          <section>
            <Eyebrow>1 · Pick a patient</Eyebrow>
            {patients.error && !patients.data ? (
              <div className="mt-4"><ErrorState error={patients.error} onRetry={patients.reload} /></div>
            ) : !patients.data ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((p) => {
                  const r = p.live?.risk ?? p.risk;
                  const sc = sim?.scenarios[p.id];
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelected(p.id)}
                      className={cx(
                        "rounded-2xl border bg-surface p-4 text-left transition-all",
                        selected === p.id ? "border-teal shadow-[0_0_0_3px_var(--teal-soft)]" : "border-line hover:border-line-2",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-[15px] font-medium">{p.name}</div>
                          <div className="font-mono text-[11px] text-muted">{p.id} · {p.bed}</div>
                        </div>
                        <span className={cx("font-display text-[28px] leading-none", LEVEL_STYLE[r.level].text)}>{r.score}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-[12px]">
                        <LevelDot level={r.level} />
                        <span className={LEVEL_STYLE[r.level].text}>{r.level}</span>
                        {sc && <span className="ml-auto rounded-full bg-teal-soft px-2 py-0.5 font-mono text-[10px] text-teal">{sc}</span>}
                      </div>
                      <div className="mt-1 truncate text-[11px] text-muted">{p.conditions.join(" · ")}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Scenarios */}
          <section>
            <Eyebrow>2 · Inject for {current?.name ?? selected}</Eyebrow>
            <div className="mt-4 space-y-2">
              {!scenarios.data ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)
              ) : scenarios.data.length === 0 ? (
                <EmptyState title="No scenarios" />
              ) : (
                scenarios.data.map((sc) => {
                  const suits = sc.best_for.includes(selected);
                  const on = active === sc.key;
                  return (
                    <button
                      key={sc.key}
                      type="button"
                      disabled={!!busy}
                      onClick={() => run(`${sc.label} → ${current?.name ?? selected}`, () => api.startScenario(selected, sc.key))}
                      className={cx(
                        "w-full rounded-2xl border p-4 text-left transition-all disabled:opacity-60",
                        on ? "border-teal bg-teal-soft" : sc.key === "recover" ? "border-stable/30 hover:bg-stable-soft" : "border-line bg-surface hover:border-line-2",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-medium">{sc.label}</span>
                        {suits && <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-teal">best fit</span>}
                        {on && <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-teal">running</span>}
                      </div>
                      <p className="mt-1 text-[12px] leading-relaxed text-muted">{sc.description}</p>
                    </button>
                  );
                })
              )}
            </div>

            <div className="mt-6">
              <Eyebrow>3 · Or report a symptom now</Eyebrow>
              <div className="mt-3 flex flex-wrap gap-2">
                {QUICK_SYMPTOMS.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    disabled={!!busy}
                    onClick={() => run(`${label} reported`, () => api.reportSymptoms(selected, [key], "staff", "Reported from the demo panel"))}
                    className="h-9 rounded-full border border-line px-4 text-[13px] hover:border-line-2 disabled:opacity-60"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </Shell>
  );
}
