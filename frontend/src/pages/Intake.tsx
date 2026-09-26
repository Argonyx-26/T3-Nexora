import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BellRing,
  Check,
  ClipboardPaste,
  Cpu,
  FileScan,
  FileText,
  Image as ImageIcon,
  Keyboard,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  TriangleAlert,
  UserPlus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Shell } from "../components/Shell";
import { useDirectory } from "../components/NetworkKit";
import { useScope } from "../lib/scope";
import { Eyebrow, RiskBadge, cx } from "../components/ui";
import { api } from "../lib/api";
import { LEVEL_STYLE, RED_FLAG_SYMPTOMS, SYMPTOM_LABEL } from "../lib/format";
import type { IntakeDraft, IntakeResult, Risk } from "../lib/types";

/*
 * Add a patient: upload a report (PDF or photo), paste its text, or type it in. AYU reads it
 * into a draft, the clinician checks every value, and AYU analyses the patient at once.
 */

type Mode = "upload" | "paste" | "manual";
type Step = "input" | "reading" | "review" | "done";
const VITAL_FIELDS = [
  { k: "hr", label: "Heart rate", unit: "bpm", required: true },
  { k: "spo2", label: "SpO₂", unit: "%", required: true },
  { k: "sbp", label: "Systolic BP", unit: "mmHg", required: true },
  { k: "dbp", label: "Diastolic BP", unit: "mmHg", required: true },
  { k: "rr", label: "Respiratory rate", unit: "/min", required: true },
  { k: "temp", label: "Temperature", unit: "°C", required: true },
  { k: "glucose", label: "Blood glucose", unit: "mg/dL", required: false },
] as const;
type VK = (typeof VITAL_FIELDS)[number]["k"];

const EMPTY: IntakeDraft = { name: "", age: null, sex: "", conditions: [], medications: [], vitals: {}, symptoms: [], history: [], notes: "" };
const READING_STEPS = ["Opening the report…", "Reading the text…", "Finding vitals…", "Finding medicines and conditions…", "Checking every value…"];

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export default function Intake() {
  const [mode, setMode] = useState<Mode>("upload");
  const [step, setStep] = useState<Step>("input");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [result, setResult] = useState<IntakeResult | null>(null);
  const [draft, setDraft] = useState<IntakeDraft>(EMPTY);
  const [error, setError] = useState<string>();
  const [created, setCreated] = useState<{ id: string; name: string; risk?: Risk } | null>(null);
  const [source, setSource] = useState<"pdf" | "photo" | "text" | "manual">("manual");

  const pick = (f: File | null) => {
    setError(undefined);
    setFile(f);
    setPreview(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  };

  const read = async (override?: File) => {
    const f = override ?? file;
    setError(undefined);
    setStep("reading");
    try {
      const body = mode === "paste" && !override
        ? { text }
        : { filename: f!.name, mime: f!.type || (f!.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : ""), data_base64: await toBase64(f!) };
      const [r] = await Promise.all([api.extractReport(body), new Promise((res) => setTimeout(res, 2200))]); // let the reading animation play
      setResult(r);
      setDraft(r.draft);
      setSource(mode === "paste" && !override ? "text" : f!.type.startsWith("image/") ? "photo" : "pdf");
      setStep("review");
    } catch (e) {
      setError((e as Error).message);
      setStep("input");
    }
  };

  const trySample = async () => {
    setMode("upload");
    const blob = await fetch("/sample-admission-report.pdf").then((r) => r.blob());
    const f = new File([blob], "sample-admission-report.pdf", { type: "application/pdf" });
    pick(f);
    await read(f);
  };

  const manual = () => {
    setResult(null);
    setDraft(EMPTY);
    setSource("manual");
    setStep("review");
  };

  const reset = () => {
    setStep("input");
    setResult(null);
    setDraft(EMPTY);
    setFile(null);
    setPreview(null);
    setText("");
    setCreated(null);
    setError(undefined);
  };

  return (
    <Shell>
      <div className="mx-auto max-w-5xl px-4 pt-10 pb-24 sm:px-8">
        <Eyebrow icon={UserPlus}>Add a patient</Eyebrow>
        <h1 className="mt-3 font-display text-[clamp(40px,5.5vw,76px)] leading-[0.95]">
          Upload a report. <span className="accent text-shine">AYU reads it.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-ink-2">
          A PDF, a photo of a paper report, or pasted text. AYU pulls out the vitals, conditions, medicines and symptoms, you check every value,
          and the patient is scored and on the ward in seconds.
        </p>
        <Stepper step={step} />

        <AnimatePresence mode="wait">
          {step === "input" && (
            <motion.div key="input" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mt-8">
              <div className="grid gap-3 sm:grid-cols-3">
                {([
                  ["upload", FileScan, "Upload a report", "PDF or photo"],
                  ["paste", ClipboardPaste, "Paste report text", "From an email or EMR"],
                  ["manual", Keyboard, "Enter by hand", "Type the values in"],
                ] as const).map(([m, Icon, title, sub]) => (
                  <button key={m} type="button" onClick={() => (m === "manual" ? manual() : setMode(m))} aria-pressed={mode === m && m !== "manual"}
                    className={cx("group flex items-center gap-3 rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5",
                      mode === m && m !== "manual" ? "border-teal bg-teal-soft" : "border-line bg-surface hover:border-line-2")}>
                    <span className={cx("grid size-11 place-items-center rounded-xl", mode === m && m !== "manual" ? "bg-teal text-bg" : "bg-surface-2 text-ink-2")}><Icon size={20} aria-hidden /></span>
                    <span><span className="block text-[15px] font-medium">{title}</span><span className="text-[12px] text-muted">{sub}</span></span>
                  </button>
                ))}
              </div>

              {mode === "upload" && <DropZone file={file} preview={preview} onPick={pick} />}
              {mode === "paste" && (
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} maxLength={60000}
                  placeholder={"Paste the report here, e.g.\nName: …  Age: …  Sex: …\nBP: 150/90  Pulse: 96  SpO2: 95%  Temp: 99.1 F  RR: 20\nTab Metformin 500 mg BD …"}
                  className="mt-5 w-full rounded-3xl border border-line bg-surface p-5 font-mono text-[13px] leading-relaxed outline-none focus:border-line-2" />
              )}
              {error && <p className="mt-4 flex items-center gap-2 text-[14px] text-critical"><TriangleAlert size={16} aria-hidden />{error}</p>}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => read()} disabled={mode === "upload" ? !file : !text.trim()}
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-bg transition-colors hover:bg-teal disabled:opacity-40">
                  <Sparkles size={17} aria-hidden />Read the report
                </button>
                <button type="button" onClick={trySample} className="inline-flex h-12 items-center gap-2 rounded-full border border-line-2 px-5 text-[14px] hover:border-ink">
                  <FileText size={16} aria-hidden />Try the sample report
                </button>
                <a href="/sample-admission-report.pdf" download className="text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline">Download the sample PDF</a>
              </div>
              <p className="mt-6 text-[12px] leading-relaxed text-faint">
                With a Gemini key, the report itself is read by Gemini (handwriting, scans and photos too). Offline, AYU reads a PDF's text or
                pasted text with its own rules; a photo needs Gemini. Only the report is sent, and nothing is saved until you check it and add the patient.
              </p>
            </motion.div>
          )}

          {step === "reading" && <Reading key="reading" file={file} preview={preview} />}

          {step === "review" && (
            <motion.div key="review" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mt-8">
              <Review draft={draft} setDraft={setDraft} result={result} source={source} fileName={file?.name ?? ""}
                onBack={reset} onCreated={setCreated} setStep={setStep} />
            </motion.div>
          )}

          {step === "done" && created && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="mt-8">
              <Done created={created} onAgain={reset} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Shell>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps = ["Report", "AYU reads", "You check", "AYU analyses"];
  const at = step === "input" ? 0 : step === "reading" ? 1 : step === "review" ? 2 : 3;
  return (
    <ol className="mt-8 flex flex-wrap items-center gap-2 text-[12px]">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span className={cx("inline-flex h-7 items-center gap-1.5 rounded-full px-3 transition-colors",
            i < at ? "bg-teal-soft text-teal" : i === at ? "bg-ink text-bg" : "bg-surface-2 text-muted")}>
            {i < at ? <Check size={12} aria-hidden /> : <span className="font-mono">{i + 1}</span>}{s}
          </span>
          {i < steps.length - 1 && <span className="h-px w-5 bg-line-2" />}
        </li>
      ))}
    </ol>
  );
}

function DropZone({ file, preview, onPick }: { file: File | null; preview: string | null; onPick: (f: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onPick(f);
  }, [onPick]);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      onClick={() => input.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      className={cx("mt-5 grid min-h-[220px] cursor-pointer place-items-center rounded-3xl border-2 border-dashed p-8 text-center transition-colors",
        over ? "border-teal bg-teal-soft" : "border-line-2 bg-surface hover:border-teal/60")}
    >
      <input ref={input} type="file" accept="application/pdf,image/*,.heic,.heif" className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      {file ? (
        <div className="flex flex-col items-center gap-3">
          {preview ? <img src={preview} alt="The report photo" className="max-h-40 rounded-xl border border-line object-contain" /> : <FileText size={48} strokeWidth={1.3} className="text-teal" aria-hidden />}
          <div className="text-[15px] font-medium">{file.name}</div>
          <div className="text-[12px] text-muted">{(file.size / 1024).toFixed(0)} KB · click to choose another</div>
          <button type="button" onClick={(e) => { e.stopPropagation(); onPick(null); }} className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-critical"><X size={12} aria-hidden />Remove</button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <motion.span animate={{ y: [0, -6, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} className="grid size-16 place-items-center rounded-2xl bg-teal-soft text-teal">
            <FileScan size={30} aria-hidden />
          </motion.span>
          <div className="text-[16px] font-medium">Drop a report here, or click to choose</div>
          <div className="flex items-center gap-3 text-[12px] text-muted"><span className="inline-flex items-center gap-1"><FileText size={13} aria-hidden />PDF</span><span className="inline-flex items-center gap-1"><ImageIcon size={13} aria-hidden />JPG · PNG · HEIC (iPhone)</span><span>up to 8 MB</span></div>
        </div>
      )}
    </div>
  );
}

function Reading({ file, preview }: { file: File | null; preview: string | null }) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((x) => Math.min(READING_STEPS.length - 1, x + 1)), 450);
    return () => window.clearInterval(t);
  }, []);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-10 grid place-items-center">
      <div className="relative h-72 w-56 overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_30px_80px_-40px_var(--glow)]">
        {preview ? <img src={preview} alt="" className="absolute inset-0 size-full object-cover opacity-60" /> : (
          <div className="space-y-2.5 p-5">
            <div className="h-3 w-3/4 rounded bg-line-2" />
            {Array.from({ length: 12 }).map((_, k) => <div key={k} className="h-2 rounded bg-surface-2" style={{ width: `${55 + ((k * 37) % 40)}%` }} />)}
          </div>
        )}
        {!reduce && (
          <motion.div className="absolute inset-x-0 h-16 bg-[linear-gradient(to_bottom,transparent,var(--teal-soft),transparent)]"
            initial={{ top: "-20%" }} animate={{ top: ["-20%", "100%"] }} transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}>
            <div className="absolute inset-x-0 top-1/2 h-0.5 bg-teal shadow-[0_0_16px_var(--teal)]" />
          </motion.div>
        )}
      </div>
      <AnimatePresence mode="wait">
        <motion.p key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-6 text-[15px] text-ink-2">{READING_STEPS[i]}</motion.p>
      </AnimatePresence>
      {file && <p className="mt-1 font-mono text-[12px] text-muted">{file.name}</p>}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ review */

function Review({ draft, setDraft, result, source, fileName, onBack, onCreated, setStep }: {
  draft: IntakeDraft; setDraft: (d: IntakeDraft) => void; result: IntakeResult | null; source: "pdf" | "photo" | "text" | "manual"; fileName: string;
  onBack: () => void; onCreated: (c: { id: string; name: string; risk?: Risk }) => void; setStep: (s: Step) => void;
}) {
  const found = new Set(result?.found ?? []);
  const [condition, setCondition] = useState("");
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [bed, setBed] = useState("");
  const [scale2, setScale2] = useState(draft.conditions.some((c) => /copd/i.test(c)));
  const [scope] = useScope();
  const [site, setSite] = useState(scope.hospital !== "all" ? scope.hospital : "H01");
  const { hospitals } = useDirectory();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const set = <K extends keyof IntakeDraft>(k: K, v: IntakeDraft[K]) => setDraft({ ...draft, [k]: v });
  const missing = VITAL_FIELDS.filter((f) => f.required && draft.vitals[f.k] == null).map((f) => f.label);
  const canSave = draft.name.trim() && draft.age != null && (draft.sex === "M" || draft.sex === "F") && missing.length === 0;

  const save = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const v = draft.vitals;
      const r = await api.createPatient({
        name: draft.name, age: draft.age, sex: draft.sex, language, bed, spo2_scale: scale2 ? 2 : 1, hospital_id: site,
        conditions: draft.conditions, medications: draft.medications.filter((m) => m.name.trim()),
        vitals: { hr: v.hr, spo2: v.spo2, sbp: v.sbp, dbp: v.dbp, rr: v.rr, temp: v.temp, glucose: v.glucose ?? null },
        symptoms: draft.symptoms, history: draft.history.filter((h) => h.event.trim()), notes: draft.notes, report_name: fileName, source,
      });
      const risk = await api.risk(r.patient_id).catch(() => undefined);
      onCreated({ id: r.patient_id, name: draft.name, risk });
      setStep("done");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const Tag = ({ on }: { on: boolean }) => on ? <span className="rounded-full bg-teal-soft px-1.5 py-px text-[9px] font-medium tracking-wide text-teal uppercase">from report</span> : null;
  const input = "h-11 w-full rounded-xl border border-line bg-bg px-3 text-[14px] outline-none focus:border-teal";

  return (
    <div className="space-y-4">
      {result && (
        <div className={cx("flex flex-wrap items-center gap-3 rounded-2xl border p-4", result.found.length ? "border-teal/40 bg-teal-soft" : "border-watch/40 bg-watch-soft")}>
          {result.source === "gemini" ? <Sparkles size={18} className="text-teal" aria-hidden /> : <Cpu size={18} className="text-teal" aria-hidden />}
          <span className="text-[14px] font-medium">{result.source === "gemini" ? `Read by Gemini (${result.model})` : "Read by AYU's built-in reader"}</span>
          <span className="rounded-full bg-surface px-2.5 py-0.5 font-mono text-[12px]">{result.found.length} fields found</span>
          <span className="text-[13px] text-ink-2">{result.message}</span>
        </div>
      )}

      <section className="rounded-3xl border border-line bg-surface p-6">
        <div className="eyebrow">Patient</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <label className="block"><span className="flex items-center gap-2 text-[12px] text-muted">Full name <Tag on={found.has("name")} /></span>
            <input value={draft.name} onChange={(e) => set("name", e.target.value)} className={cx(input, "mt-1")} /></label>
          <label className="block"><span className="flex items-center gap-2 text-[12px] text-muted">Age <Tag on={found.has("age")} /></span>
            <input inputMode="numeric" value={draft.age ?? ""} onChange={(e) => set("age", e.target.value === "" ? null : Math.max(0, Math.min(120, Number(e.target.value) || 0)))} className={cx(input, "mt-1")} /></label>
          <div><span className="flex items-center gap-2 text-[12px] text-muted">Sex <Tag on={found.has("sex")} /></span>
            <div className="mt-1 flex gap-1.5">{(["F", "M"] as const).map((s) => (
              <button key={s} type="button" onClick={() => set("sex", s)} aria-pressed={draft.sex === s}
                className={cx("h-11 flex-1 rounded-xl border text-[14px]", draft.sex === s ? "border-teal bg-teal-soft text-teal" : "border-line")}>{s === "F" ? "Female" : "Male"}</button>
            ))}</div></div>
          <label className="block sm:col-span-3"><span className="text-[12px] text-muted">Site</span>
            <select value={site} onChange={(e) => setSite(e.target.value)} className={cx(input, "mt-1")}>
              {(hospitals.data ?? [{ id: "H01", name: "City General Hospital" }]).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select></label>
          <label className="block"><span className="text-[12px] text-muted">Bed (optional)</span>
            <input value={bed} onChange={(e) => setBed(e.target.value)} placeholder="auto" className={cx(input, "mt-1")} /></label>
          <div><span className="text-[12px] text-muted">Language</span>
            <div className="mt-1 flex gap-1.5">{(["en", "hi"] as const).map((l) => (
              <button key={l} type="button" onClick={() => setLanguage(l)} aria-pressed={language === l}
                className={cx("h-11 flex-1 rounded-xl border text-[14px]", language === l ? "border-teal bg-teal-soft text-teal" : "border-line")}>{l === "en" ? "English" : "हिंदी"}</button>
            ))}</div></div>
          <button type="button" onClick={() => setScale2((x) => !x)} aria-pressed={scale2}
            className={cx("mt-5 h-11 rounded-xl border px-3 text-[12px]", scale2 ? "border-teal bg-teal-soft text-teal" : "border-line text-muted")}>
            SpO₂ target 88–92% (NEWS2 scale 2)
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-line bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="eyebrow">Vitals from the report</div>
          {missing.length > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-watch-soft px-3 py-1 text-[12px] text-watch"><TriangleAlert size={13} aria-hidden />Needed to score: {missing.join(", ")}</span>}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {VITAL_FIELDS.map((f) => {
            const v = draft.vitals[f.k as VK];
            const need = f.required && v == null;
            return (
              <label key={f.k} className="block">
                <span className="flex items-center gap-2 text-[12px] text-muted">{f.label}{!f.required && " (optional)"} <Tag on={found.has(`vitals.${f.k}`)} /></span>
                <div className={cx("mt-1 flex items-center rounded-xl border bg-bg", need ? "border-watch/60" : "border-line", "focus-within:border-teal")}>
                  <input inputMode="decimal" value={v ?? ""} onChange={(e) => set("vitals", { ...draft.vitals, [f.k]: e.target.value === "" ? undefined : Number(e.target.value) })}
                    className="h-11 w-full bg-transparent px-3 font-mono text-[15px] outline-none" aria-label={f.label} />
                  <span className="pr-3 font-mono text-[11px] text-muted">{f.unit}</span>
                </div>
              </label>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-line bg-surface p-6">
          <div className="flex items-center gap-2"><span className="eyebrow">Conditions</span><Tag on={found.has("conditions")} /></div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {draft.conditions.map((c) => (
              <span key={c} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pr-1.5 pl-3 text-[13px]">{c}
                <button type="button" onClick={() => set("conditions", draft.conditions.filter((x) => x !== c))} aria-label={`Remove ${c}`} className="grid size-5 place-items-center rounded-full hover:bg-critical-soft hover:text-critical"><X size={11} /></button>
              </span>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (condition.trim()) { set("conditions", [...draft.conditions, condition.trim()]); setCondition(""); } }} className="mt-3 flex gap-2">
            <input value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="Add a condition" className={input} />
            <button type="submit" className="grid size-11 shrink-0 place-items-center rounded-xl border border-line hover:border-teal" aria-label="Add condition"><Plus size={16} /></button>
          </form>
          <div className="mt-5 flex items-center gap-2"><span className="eyebrow">Symptoms</span><Tag on={found.has("symptoms")} /></div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Object.keys(SYMPTOM_LABEL).map((k) => {
              const on = draft.symptoms.includes(k);
              const red = RED_FLAG_SYMPTOMS.has(k);
              return (
                <button key={k} type="button" aria-pressed={on} onClick={() => set("symptoms", on ? draft.symptoms.filter((x) => x !== k) : [...draft.symptoms, k])}
                  className={cx("h-8 rounded-full border px-3 text-[12px] transition-colors", on ? (red ? "border-critical bg-critical-soft text-critical" : "border-teal bg-teal-soft text-teal") : "border-line text-muted hover:text-ink")}>
                  {SYMPTOM_LABEL[k].en}
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-line bg-surface p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><span className="eyebrow">Medicines</span><Tag on={found.has("medications")} /></div>
            <button type="button" onClick={() => set("medications", [...draft.medications, { name: "", dose: "", purpose: "", times: ["08:00"], critical: false }])}
              className="inline-flex h-8 items-center gap-1 rounded-full border border-line px-3 text-[12px] hover:border-teal"><Plus size={12} aria-hidden />Add</button>
          </div>
          <ul className="mt-3 space-y-2">
            {draft.medications.map((m, i) => {
              const upd = (patch: Partial<typeof m>) => set("medications", draft.medications.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <li key={i} className="grid grid-cols-[1.4fr_0.8fr_1.1fr_auto_auto] items-center gap-1.5">
                  <input value={m.name} onChange={(e) => upd({ name: e.target.value })} placeholder="Medicine" aria-label="Medicine" className={cx(input, "h-10")} />
                  <input value={m.dose} onChange={(e) => upd({ dose: e.target.value })} placeholder="Dose" aria-label="Dose" className={cx(input, "h-10")} />
                  <input value={m.times.join(", ")} onChange={(e) => upd({ times: e.target.value.split(/[,\s]+/).filter(Boolean) })} placeholder="08:00, 20:00" aria-label="Times" className={cx(input, "h-10 font-mono text-[12px]")} />
                  <button type="button" onClick={() => upd({ critical: !m.critical })} aria-pressed={m.critical} title="Critical medicine"
                    className={cx("h-10 rounded-xl border px-2 text-[11px]", m.critical ? "border-critical/50 bg-critical-soft text-critical" : "border-line text-muted")}>critical</button>
                  <button type="button" onClick={() => set("medications", draft.medications.filter((_, j) => j !== i))} aria-label="Remove medicine" className="grid size-10 place-items-center rounded-xl text-muted hover:text-critical"><Trash2 size={15} /></button>
                </li>
              );
            })}
            {draft.medications.length === 0 && <li className="text-[13px] text-muted">No medicines yet.</li>}
          </ul>
          <div className="mt-5 flex items-center gap-2"><span className="eyebrow">History & impression</span><Tag on={found.has("history") || found.has("notes")} /></div>
          <ul className="mt-2 space-y-1">
            {draft.history.map((h, i) => <li key={i} className="flex gap-3 text-[13px]"><span className="w-12 font-mono text-muted">{h.year}</span><span>{h.event}</span></li>)}
          </ul>
          <textarea value={draft.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Diagnosis / impression" className="mt-2 w-full resize-none rounded-xl border border-line bg-bg p-3 text-[13px] outline-none focus:border-teal" />
        </section>
      </div>

      {error && <p className="flex items-center gap-2 text-[14px] text-critical"><TriangleAlert size={16} aria-hidden />{error}</p>}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-line-2 bg-surface/90 p-3 shadow-2xl backdrop-blur-xl">
        <button type="button" onClick={onBack} className="inline-flex h-11 items-center gap-2 rounded-full px-4 text-[14px] text-muted hover:text-ink"><RotateCcw size={15} aria-hidden />Start over</button>
        <span className="text-[12px] text-muted">{canSave ? "Checked everything? AYU will score the patient at once." : "Name, age, sex and the six core vitals are needed to score the patient."}</span>
        <button type="button" onClick={save} disabled={!canSave || busy}
          className="ml-auto inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-bg transition-colors hover:bg-teal disabled:opacity-40">
          <UserPlus size={17} aria-hidden />{busy ? "Adding…" : "Add to ward & analyse"}
        </button>
      </div>
    </div>
  );
}

function Done({ created, onAgain }: { created: { id: string; name: string; risk?: Risk }; onAgain: () => void }) {
  const r = created.risk;
  const s = r ? LEVEL_STYLE[r.level] : LEVEL_STYLE.Stable;
  const alerted = r && r.level !== "Stable";
  return (
    <div className={cx("overflow-hidden rounded-[28px] border border-line p-8 sm:p-10", s.soft)}>
      <div className="flex flex-wrap items-start gap-6">
        <motion.svg viewBox="0 0 52 52" className={cx("size-16 shrink-0", s.text)} aria-hidden>
          <motion.circle cx={26} cy={26} r={23} fill="none" stroke="currentColor" strokeWidth={3} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6 }} />
          <motion.path d="M15 27 l7 7 l15 -16" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.5 }} />
        </motion.svg>
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Added to the ward · {created.id}</div>
          <h2 className="mt-2 font-display text-[clamp(32px,4vw,52px)] leading-none">{created.name}</h2>
          {r && (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <RiskBadge level={r.level} score={r.score} />
                <span className="font-mono text-[13px] text-ink-2">NEWS2 {r.news2.total} · {r.news2.band} · qSOFA {r.qsofa.score}/3</span>
                <span className={cx("font-medium", s.text)}>{r.urgency}</span>
              </div>
              <div className="mt-5 text-[12px] tracking-wide text-muted uppercase">What AYU found</div>
              <ul className="mt-2 space-y-1">
                {r.factors.filter((f) => f.contribution > 0).slice(0, 5).map((f) => (
                  <li key={f.factor} className="flex items-center justify-between gap-4 text-[14px]"><span>{f.headline}</span><span className="font-mono text-[12px] text-muted">+{f.contribution.toFixed(1)}</span></li>
                ))}
              </ul>
              {alerted && <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-[13px]"><BellRing size={14} className={cx("bell-ring", s.text)} aria-hidden />An alert is on the doctor's dashboard now</p>}
              <p className="mt-4 text-[12px] text-muted">Only the report's readings are used — AYU never simulates this patient. Add new readings from their profile or the patient portal; after about a day of readings AYU learns their own baseline.</p>
            </>
          )}
        </div>
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to={`/patients/${created.id}`} className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-bg hover:bg-teal">Open the full analysis <ArrowRight size={16} aria-hidden /></Link>
        <Link to="/doctor" className="inline-flex h-12 items-center gap-2 rounded-full border border-line-2 px-5 text-[14px] hover:border-ink">See it on the ward</Link>
        <button type="button" onClick={onAgain} className="inline-flex h-12 items-center gap-2 rounded-full px-5 text-[14px] text-muted hover:text-ink"><Plus size={15} aria-hidden />Add another</button>
      </div>
    </div>
  );
}
