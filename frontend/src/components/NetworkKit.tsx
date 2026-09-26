import { motion } from "framer-motion";
import { Building2, Hospital, Send, Stethoscope, UserRoundCheck } from "lucide-react";
import { useState } from "react";
import { api, useQuery } from "../lib/api";
import { useScope } from "../lib/scope";
import type { DoctorInfo, HospitalInfo } from "../lib/types";
import { cx } from "./ui";

/** Sites and doctors, fetched once per screen and kept fresh. */
export function useDirectory() {
  const hospitals = useQuery((s) => api.hospitals(s), [], 30_000);
  const doctors = useQuery((s) => api.doctors(undefined, s), [], 30_000);
  const doctorById = Object.fromEntries((doctors.data ?? []).map((d) => [d.id, d])) as Record<string, DoctorInfo>;
  const hospitalById = Object.fromEntries((hospitals.data ?? []).map((h) => [h.id, h])) as Record<string, HospitalInfo>;
  return { hospitals, doctors, doctorById, hospitalById, reload: () => { hospitals.reload(); doctors.reload(); } };
}

/** Pick a site (or the whole network) and a doctor's list (or everyone's). */
export function ScopeBar({ className }: { className?: string }) {
  const [scope, setScope] = useScope();
  const { hospitals, doctors } = useDirectory();
  const docs = (doctors.data ?? []).filter((d) => scope.hospital === "all" || d.hospital_id === scope.hospital);
  const select = "h-9 rounded-full border border-line bg-surface pr-8 pl-9 text-[13px] outline-none focus:border-teal appearance-none";
  return (
    <div className={cx("flex flex-wrap items-center gap-2", className)}>
      <label className="relative">
        <Building2 size={14} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <select aria-label="Site" value={scope.hospital} className={select}
          onChange={(e) => setScope({ hospital: e.target.value, doctor: "all" })}>
          <option value="all">Whole network</option>
          {(hospitals.data ?? []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </label>
      <label className="relative">
        <Stethoscope size={14} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <select aria-label="Doctor" value={scope.doctor} className={select} onChange={(e) => setScope({ doctor: e.target.value })}>
          <option value="all">All doctors</option>
          {docs.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.specialty}{d.on_duty ? "" : " (off duty)"}</option>)}
        </select>
      </label>
      {(scope.hospital !== "all" || scope.doctor !== "all") && (
        <button type="button" onClick={() => setScope({ hospital: "all", doctor: "all" })} className="h-9 rounded-full px-3 text-[12px] text-muted hover:text-ink">Clear</button>
      )}
    </div>
  );
}

/** Under a patient's name: their site, their doctor, why, and a way to change it. */
export function CareLine({ patient, onChanged }: {
  patient: { id: string; hospital_id?: string; doctor_id?: string; assigned_reason?: string; registered_by?: string };
  onChanged: () => void;
}) {
  const { doctorById, hospitalById, doctors, reload } = useDirectory();
  const [busy, setBusy] = useState(false);
  const d = patient.doctor_id ? doctorById[patient.doctor_id] : undefined;
  const h = hospitalById[patient.hospital_id ?? "H01"];
  const choices = (doctors.data ?? []).filter((x) => x.hospital_id === (patient.hospital_id ?? "H01"));
  const change = async (value: string) => {
    setBusy(true);
    try {
      await api.assign(patient.id, value === "auto" ? null : value, "Doctor");
      reload();
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1">
        {h?.kind === "phc" ? <Building2 size={13} aria-hidden /> : <Hospital size={13} aria-hidden />}{h?.name ?? patient.hospital_id}
      </span>
      <span className={cx("inline-flex items-center gap-1.5 rounded-full px-3 py-1", d ? "bg-teal-soft text-teal" : "bg-watch-soft text-watch")}>
        <UserRoundCheck size={13} aria-hidden />{d ? `${d.name} · ${d.specialty}` : "No doctor yet"}
      </span>
      {patient.assigned_reason && <span className="text-[12px] text-muted">{patient.assigned_reason}</span>}
      {patient.registered_by === "self" && <span className="rounded-full bg-violet-soft px-2.5 py-0.5 text-[11px] text-violet">Self-registered · verify</span>}
      <ReferButton patientId={patient.id} from={patient.hospital_id ?? "H01"} onDone={() => { reload(); onChanged(); }} />
      <label className="ml-auto">
        <span className="sr-only">Reassign</span>
        <select disabled={busy} value="" onChange={(e) => e.target.value && change(e.target.value)}
          className="h-8 rounded-full border border-line bg-surface px-3 text-[12px] text-muted outline-none hover:text-ink">
          <option value="">Reassign…</option>
          <option value="auto">Let AYU choose</option>
          {choices.map((x) => <option key={x.id} value={x.id} disabled={x.id === patient.doctor_id}>{x.name} · {x.specialty}{x.on_duty ? "" : " (off duty)"}</option>)}
        </select>
      </label>
    </div>
  );
}

/** A doctor's load as a bar: acuity-weighted, against their capacity. */
export function LoadBar({ d }: { d: DoctorInfo }) {
  const max = d.max_patients * 4;
  const pct = Math.min(100, (d.load / max) * 100);
  const tone = d.patients.length >= d.max_patients ? "bg-critical" : d.high_risk >= 2 ? "bg-warning" : "bg-teal";
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
      <motion.div className={cx("h-full rounded-full", tone)} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7 }} />
    </div>
  );
}

/** Send a patient to another site on the network, with a reason; their whole record goes too. */
export function ReferButton({ patientId, from, onDone }: { patientId: string; from: string; onDone: () => void }) {
  const { hospitals, doctorById, reload } = useDirectory();
  const [open, setOpen] = useState(false);
  const others = (hospitals.data ?? []).filter((h) => h.id !== from);
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string>();
  if (others.length === 0) return null;
  const dest = to || others[0].id;
  const go = async () => {
    setBusy(true);
    try {
      const r = await api.refer(patientId, dest, reason, "Doctor");
      reload();
      setDone(`Referred to ${others.find((h) => h.id === dest)?.name}${r.doctor_id ? ` · ${doctorById[r.doctor_id]?.name ?? r.doctor_id}` : ""}`);
      setOpen(false);
      onDone();
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="relative inline-flex items-center gap-2">
      <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-violet-soft px-3 text-[12px] font-medium text-violet hover:opacity-90">
        <Send size={12} aria-hidden />Refer…
      </button>
      {done && <span className="text-[12px] text-violet">{done}</span>}
      {open && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          className="absolute top-10 left-0 z-30 w-80 rounded-2xl border border-line-2 bg-surface p-4 shadow-2xl">
          <div className="text-[13px] font-medium">Refer to another site</div>
          <select value={dest} onChange={(e) => setTo(e.target.value)} className="mt-2 h-10 w-full rounded-xl border border-line bg-bg px-3 text-[13px]">
            {others.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Reason, e.g. needs cardiology review"
            className="mt-2 h-10 w-full rounded-xl border border-line bg-bg px-3 text-[13px]" />
          <p className="mt-2 text-[11px] text-muted">Readings, medicines, symptoms, notes and alerts go with the patient; AYU assigns a doctor there.</p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-full px-3 text-[12px] text-muted">Cancel</button>
            <button type="button" onClick={go} disabled={busy} className="h-9 rounded-full bg-violet px-4 text-[12px] font-medium text-white disabled:opacity-50">{busy ? "Referring…" : "Refer"}</button>
          </div>
        </motion.div>
      )}
    </span>
  );
}
