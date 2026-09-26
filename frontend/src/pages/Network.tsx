import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Building2, Hospital, Network as NetworkIcon, Power, UserPlus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { LoadBar, useDirectory } from "../components/NetworkKit";
import { Shell } from "../components/Shell";
import { Eyebrow, LevelDot, Skeleton, cx } from "../components/ui";
import { api, useQuery } from "../lib/api";
import { setScope } from "../lib/scope";
import type { DoctorInfo, Level, PatientSummary } from "../lib/types";

/*
 * The network view: every site on AYU (hospitals and PHCs), its doctors, who looks after
 * whom and how loaded each doctor is — and what happens when a doctor goes off duty.
 */

export default function Network() {
  const { hospitals, doctors, reload } = useDirectory();
  const patients = useQuery((s) => api.patients(s), [], 20_000);
  const [handover, setHandover] = useState<{ doctor: string; moves: { name: string; to: string; reason: string }[] } | null>(null);
  const byId = Object.fromEntries((patients.data ?? []).map((p) => [p.id, p])) as Record<string, PatientSummary>;
  const docName = Object.fromEntries((doctors.data ?? []).map((d) => [d.id, d.name]));

  const toggle = async (d: DoctorInfo) => {
    const r = await api.setDuty(d.id, !d.on_duty);
    reload();
    patients.reload();
    setHandover(!d.on_duty ? null : { doctor: d.name, moves: r.handed_over.map((m) => ({ name: m.name, to: docName[m.doctor_id] ?? "nobody yet", reason: m.reason })) });
  };

  return (
    <Shell>
      <div className="mx-auto max-w-[1400px] px-4 pt-10 pb-20 sm:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Eyebrow icon={NetworkIcon}>The AYU network</Eyebrow>
            <h1 className="mt-3 font-display text-[clamp(40px,5vw,72px)] leading-none">One AYU, <span className="accent text-shine">many sites.</span></h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-2">
              Every hospital and primary health centre on the network, its doctors, and who looks after whom. AYU assigns each patient by
              specialty and acuity-weighted load — and hands patients over when a doctor goes off duty.
            </p>
          </div>
          <Link to="/intake" className="inline-flex h-11 items-center gap-2 self-start rounded-full bg-ink px-5 text-[14px] font-medium text-bg hover:bg-teal lg:self-auto">
            <UserPlus size={16} aria-hidden />Add a patient
          </Link>
        </div>

        <AnimatePresence>
          {handover && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-6 rounded-2xl border border-teal/40 bg-teal-soft p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[14px] font-medium text-teal">{handover.doctor} went off duty — {handover.moves.length ? `${handover.moves.length} patient${handover.moves.length === 1 ? "" : "s"} handed over` : "no patients to hand over"}</div>
                <button type="button" onClick={() => setHandover(null)} className="text-[12px] text-muted hover:text-ink">Dismiss</button>
              </div>
              <ul className="mt-2 space-y-1">
                {handover.moves.map((m) => (
                  <li key={m.name} className="flex flex-wrap items-center gap-2 text-[13px]"><span className="font-medium">{m.name}</span><ArrowRight size={13} aria-hidden /><span>{m.to}</span><span className="text-muted">· {m.reason}</span></li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-8 space-y-6">
          {!hospitals.data || !doctors.data ? <Skeleton className="h-96 rounded-3xl" /> : hospitals.data.map((h, hi) => {
            const docs = doctors.data!.filter((d) => d.hospital_id === h.id);
            return (
              <motion.section key={h.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: hi * 0.08 }}
                className="rounded-3xl border border-line bg-surface p-6">
                <div className="flex flex-wrap items-center gap-4">
                  <span className={cx("grid size-12 place-items-center rounded-2xl", h.kind === "phc" ? "bg-violet-soft text-violet" : "bg-teal-soft text-teal")}>
                    {h.kind === "phc" ? <Building2 size={22} aria-hidden /> : <Hospital size={22} aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[19px] font-medium">{h.name}</div>
                    <div className="text-[13px] text-muted">{h.city} · {h.kind === "phc" ? "Primary health centre" : "Hospital"}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[12px]">
                    {([["Patients", h.patients, ""], ["High-risk", h.high_risk, h.high_risk ? "text-warning" : ""], ["Unassigned", h.unassigned, h.unassigned ? "text-critical" : ""], ["On duty", `${h.on_duty}/${h.doctors}`, ""]] as const).map(([k, v, tone]) => (
                      <span key={k} className="rounded-xl bg-surface-2 px-3 py-1.5"><span className="text-muted">{k} </span><span className={cx("font-mono font-medium tnum", tone)}>{v}</span></span>
                    ))}
                    <Link to="/doctor" onClick={() => setScope({ hospital: h.id, doctor: "all" })} className="inline-flex items-center gap-1 rounded-xl border border-line px-3 py-1.5 hover:border-ink">Open ward <ArrowRight size={12} aria-hidden /></Link>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {docs.map((d) => (
                    <div key={d.id} className={cx("rounded-2xl border p-4 transition-opacity", d.on_duty ? "border-line" : "border-dashed border-line-2 opacity-60")}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[15px] font-medium">{d.name}</div>
                          <div className="text-[12px] text-muted">{d.specialty}</div>
                        </div>
                        <button type="button" onClick={() => toggle(d)} aria-pressed={d.on_duty}
                          className={cx("inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px]", d.on_duty ? "bg-stable-soft text-stable" : "bg-surface-2 text-muted")}>
                          <Power size={12} aria-hidden />{d.on_duty ? "On duty" : "Off duty"}
                        </button>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-[12px] text-muted">
                        <span>{d.patients.length}/{d.max_patients} patients{d.high_risk ? ` · ${d.high_risk} high-risk` : ""}</span>
                        <span className="font-mono">load {d.load}</span>
                      </div>
                      <div className="mt-1.5"><LoadBar d={d} /></div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {d.patients.map((pid) => {
                          const p = byId[pid];
                          if (!p) return null;
                          return (
                            <Link key={pid} to={`/patients/${pid}`} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[12px] hover:bg-teal-soft">
                              <LevelDot level={p.risk.level as Level} />{p.name.split(" ")[0]}
                            </Link>
                          );
                        })}
                        {d.patients.length === 0 && <span className="text-[12px] text-faint">No patients</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.section>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}
