import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, FileScan, HeartPulse, Languages, Plus, ShieldCheck, Trash2, UserPlus, Wind, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDirectory } from "../components/NetworkKit";
import { Shell } from "../components/Shell";
import { cx } from "../components/ui";
import { api } from "../lib/api";
import { LEVEL_STYLE, RED_FLAG_SYMPTOMS, SYMPTOM_LABEL } from "../lib/format";
import type { Level } from "../lib/types";

/*
 * A patient (or an ASHA worker for them) joins AYU on their own: about you, your health,
 * today's readings — with tap-along counters for pulse and breathing — and consent. AYU
 * scores them at once and assigns a doctor at the site they chose.
 */

type Lang = "en" | "hi";
const T = {
  en: {
    title: "Join AYU", sub: "Takes about two minutes. Your care team sees everything you enter.",
    s1: "About you", s2: "Your health", s3: "Today's readings", s4: "Confirm",
    name: "Full name", age: "Age", sex: "Sex", female: "Female", male: "Male", site: "Where do you get care?",
    conds: "Any long-term conditions?", other: "Something else", meds: "Medicines you take", addMed: "Add a medicine", medName: "Medicine", dose: "Dose",
    morning: "Morning", afternoon: "Afternoon", evening: "Evening", night: "Night", haveReport: "Have a report? Let AYU read it",
    reading: "Reading…", readDone: (n: number) => `Filled ${n} fields from your report — please check them.`,
    hr: "Pulse (heart rate)", spo2: "Oxygen (SpO₂)", bp: "Blood pressure", sys: "Top", dia: "Bottom", temp: "Temperature", rr: "Breaths per minute", glucose: "Blood sugar (optional)",
    tapPulse: "Count my pulse", tapBreath: "Count my breathing", tapHintPulse: "Tap once for every beat you feel at your wrist, for 15 seconds.",
    tapHintBreath: "Tap once each time your chest rises, for 30 seconds.", tap: "Tap", start: "Start", seconds: "s left",
    feel: "How do you feel right now?", consent: "I agree to share these readings with my care team. AYU helps my doctor; it does not diagnose me.",
    next: "Next", back: "Back", submit: "Join and check my health", need: "Please fill in the readings marked •",
    doneTitle: "You're on AYU", yourDoctor: "Your doctor", goDash: "Open my dashboard", redflag: "Some of what you ticked can be serious — please tell a nurse or call 108 now.",
  },
  hi: {
    title: "AYU से जुड़ें", sub: "लगभग दो मिनट लगेंगे। आप जो भी भरेंगे, आपकी देखभाल टीम उसे देखेगी।",
    s1: "आपके बारे में", s2: "आपकी सेहत", s3: "आज की रीडिंग", s4: "पुष्टि करें",
    name: "पूरा नाम", age: "उम्र", sex: "लिंग", female: "महिला", male: "पुरुष", site: "आप कहाँ इलाज कराते हैं?",
    conds: "कोई लंबी बीमारी?", other: "कुछ और", meds: "आप कौन सी दवाइयाँ लेते हैं", addMed: "दवा जोड़ें", medName: "दवा", dose: "खुराक",
    morning: "सुबह", afternoon: "दोपहर", evening: "शाम", night: "रात", haveReport: "रिपोर्ट है? AYU पढ़ लेगा",
    reading: "पढ़ रहा है…", readDone: (n: number) => `आपकी रिपोर्ट से ${n} चीज़ें भरी गईं — कृपया जाँच लें।`,
    hr: "नब्ज़ (धड़कन)", spo2: "ऑक्सीजन (SpO₂)", bp: "ब्लड प्रेशर", sys: "ऊपर", dia: "नीचे", temp: "तापमान", rr: "एक मिनट में साँसें", glucose: "ब्लड शुगर (वैकल्पिक)",
    tapPulse: "मेरी नब्ज़ गिनें", tapBreath: "मेरी साँसें गिनें", tapHintPulse: "15 सेकंड तक कलाई पर हर धड़कन पर एक बार टैप करें।",
    tapHintBreath: "30 सेकंड तक हर बार छाती उठने पर एक बार टैप करें।", tap: "टैप", start: "शुरू", seconds: "सेकंड बाकी",
    feel: "अभी आप कैसा महसूस कर रहे हैं?", consent: "मैं ये रीडिंग अपनी देखभाल टीम के साथ साझा करने के लिए सहमत हूँ। AYU डॉक्टर की मदद करता है; यह बीमारी तय नहीं करता।",
    next: "आगे", back: "पीछे", submit: "जुड़ें और मेरी सेहत देखें", need: "• वाली रीडिंग भरें",
    doneTitle: "आप AYU पर हैं", yourDoctor: "आपके डॉक्टर", goDash: "मेरा डैशबोर्ड खोलें", redflag: "आपने जो चुना उनमें से कुछ गंभीर हो सकता है — कृपया अभी नर्स को बताएं या 108 पर कॉल करें।",
  },
};

const CONDITIONS: { en: string; hi: string; value: string }[] = [
  { en: "Diabetes", hi: "शुगर (डायबिटीज़)", value: "Type 2 diabetes" },
  { en: "High BP", hi: "हाई BP", value: "Hypertension" },
  { en: "Asthma", hi: "अस्थमा", value: "Asthma" },
  { en: "COPD", hi: "COPD", value: "COPD" },
  { en: "Heart disease", hi: "दिल की बीमारी", value: "Heart disease" },
  { en: "Kidney disease", hi: "किडनी की बीमारी", value: "Chronic kidney disease" },
  { en: "Thyroid", hi: "थायरॉइड", value: "Hypothyroidism" },
];
const SLOTS = [["morning", "08:00"], ["afternoon", "14:00"], ["evening", "20:00"], ["night", "22:00"]] as const;
const QUICK = ["breathlessness", "chest_pain", "fever_chills", "cough", "dizziness", "fatigue", "severe_headache", "palpitations"];

interface Med { name: string; dose: string; times: string[] }

export default function Register() {
  const [lang, setLang] = useState<Lang>("en");
  const t = T[lang];
  const [step, setStep] = useState(0);
  const { hospitals } = useDirectory();
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<"M" | "F" | "">("");
  const [site, setSite] = useState("H02");
  const [conds, setConds] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const [meds, setMeds] = useState<Med[]>([]);
  const [v, setV] = useState<Record<string, string>>({});
  const [fahrenheit, setF] = useState(false);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [done, setDone] = useState<{ id: string; level: Level; score: number; doctor: string; reason: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { doctorById, reload } = useDirectory();

  const setVital = (k: string, val: string | number) => setV((x) => ({ ...x, [k]: String(val) }));
  const need = ["hr", "spo2", "sbp", "dbp", "rr", "temp"].filter((k) => !v[k]);
  const canNext = [name.trim() && Number(age) > 0 && sex, true, need.length === 0, consent][step];

  const readReport = async (f: File) => {
    setMsg(t.reading);
    try {
      const data = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
      const out = await api.extractReport({ filename: f.name, mime: f.type, data_base64: data });
      const d = out.draft;
      if (d.name && !name) setName(d.name);
      if (d.age && !age) setAge(String(d.age));
      if (d.sex && !sex) setSex(d.sex);
      if (d.conditions.length) setConds((c) => [...new Set([...c, ...d.conditions])]);
      if (d.medications.length) setMeds((m) => [...m, ...d.medications.map((x) => ({ name: x.name, dose: x.dose, times: x.times }))]);
      Object.entries(d.vitals).forEach(([k, val]) => val != null && setVital(k, val));
      if (d.symptoms.length) setSymptoms((s) => [...new Set([...s, ...d.symptoms])]);
      setMsg(out.found.length ? t.readDone(out.found.length) : out.message);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const submit = async () => {
    setBusy(true);
    setMsg(undefined);
    try {
      const temp = Number(v.temp);
      const r = await api.createPatient({
        name, age: Number(age), sex, language: lang, hospital_id: site, source: "self", consent,
        conditions: conds, medications: meds.filter((m) => m.name.trim()).map((m) => ({ ...m, times: m.times.length ? m.times : ["08:00"] })),
        vitals: { hr: Number(v.hr), spo2: Number(v.spo2), sbp: Number(v.sbp), dbp: Number(v.dbp), rr: Number(v.rr),
                  temp: fahrenheit ? Math.round(((temp - 32) * 5 / 9) * 10) / 10 : temp, glucose: v.glucose ? Number(v.glucose) : null },
        symptoms,
      });
      reload();
      const p = r.patient;
      setDone({ id: r.patient_id, level: p.risk.level as Level, score: p.risk.score, doctor: p.doctor_id ?? "", reason: p.assigned_reason ?? "" });
      setStep(4);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const input = "h-12 w-full rounded-2xl border border-line bg-bg px-4 text-[16px] outline-none focus:border-teal";
  const steps = [t.s1, t.s2, t.s3, t.s4];

  return (
    <Shell>
      <div lang={lang} className="mx-auto max-w-2xl px-4 pt-10 pb-24 sm:px-8">
        <div className="flex items-center justify-between gap-3">
          <Link to="/patient" className="text-[13px] text-muted hover:text-ink">← {lang === "hi" ? "वापस" : "Back"}</Link>
          <div className="flex items-center rounded-full border border-line p-1" role="group" aria-label="Language">
            <Languages size={14} aria-hidden className="mx-2 text-muted" />
            {(["en", "hi"] as Lang[]).map((x) => (
              <button key={x} type="button" onClick={() => setLang(x)} aria-pressed={lang === x}
                className={cx("h-8 rounded-full px-4 text-[13px]", lang === x ? "bg-ink text-bg" : "text-muted hover:text-ink")}>{x === "en" ? "English" : "हिंदी"}</button>
            ))}
          </div>
        </div>
        <h1 className="mt-6 font-display text-[clamp(40px,7vw,68px)] leading-none">{t.title}</h1>
        <p className="mt-3 text-[15px] text-muted">{t.sub}</p>

        {step < 4 && (
          <div className="mt-6 flex gap-1.5">
            {steps.map((s, i) => (
              <div key={s} className="flex-1">
                <div className="h-1 overflow-hidden rounded-full bg-surface-2"><motion.div className="h-full bg-teal" animate={{ width: i <= step ? "100%" : "0%" }} /></div>
                <div className={cx("mt-1.5 text-[11px]", i === step ? "text-ink" : "text-muted")}>{s}</div>
              </div>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }} className="mt-6 space-y-4">
            {step === 0 && (
              <>
                <label className="block"><span className="text-[13px] text-muted">{t.name}</span><input value={name} onChange={(e) => setName(e.target.value)} className={cx(input, "mt-1")} autoComplete="name" /></label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block"><span className="text-[13px] text-muted">{t.age}</span><input inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} className={cx(input, "mt-1")} /></label>
                  <div><span className="text-[13px] text-muted">{t.sex}</span>
                    <div className="mt-1 flex gap-1.5">{(["F", "M"] as const).map((s) => (
                      <button key={s} type="button" onClick={() => setSex(s)} aria-pressed={sex === s} className={cx("h-12 flex-1 rounded-2xl border text-[15px]", sex === s ? "border-teal bg-teal-soft text-teal" : "border-line")}>{s === "F" ? t.female : t.male}</button>
                    ))}</div></div>
                </div>
                <div><span className="text-[13px] text-muted">{t.site}</span>
                  <div className="mt-1 grid gap-2">{(hospitals.data ?? []).map((h) => (
                    <button key={h.id} type="button" onClick={() => setSite(h.id)} aria-pressed={site === h.id}
                      className={cx("flex items-center justify-between rounded-2xl border px-4 py-3 text-left", site === h.id ? "border-teal bg-teal-soft" : "border-line")}>
                      <span><span className="block text-[15px]">{h.name}</span><span className="text-[12px] text-muted">{h.city}</span></span>
                      {site === h.id && <Check size={18} className="text-teal" aria-hidden />}
                    </button>
                  ))}</div></div>
                <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex h-11 items-center gap-2 rounded-full border border-dashed border-line-2 px-4 text-[14px] text-ink-2 hover:border-teal">
                  <FileScan size={16} aria-hidden />{t.haveReport}
                </button>
                <input ref={fileInput} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => e.target.files?.[0] && readReport(e.target.files[0])} />
              </>
            )}

            {step === 1 && (
              <>
                <div><span className="text-[13px] text-muted">{t.conds}</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {CONDITIONS.map((c) => {
                      const on = conds.includes(c.value);
                      return <button key={c.value} type="button" aria-pressed={on} onClick={() => setConds((x) => (on ? x.filter((y) => y !== c.value) : [...x, c.value]))}
                        className={cx("h-10 rounded-full border px-4 text-[14px]", on ? "border-teal bg-teal-soft text-teal" : "border-line")}>{c[lang]}</button>;
                    })}
                    {conds.filter((c) => !CONDITIONS.some((x) => x.value === c)).map((c) => (
                      <span key={c} className="inline-flex h-10 items-center gap-1 rounded-full bg-teal-soft pr-2 pl-4 text-[14px] text-teal">{c}
                        <button type="button" onClick={() => setConds((x) => x.filter((y) => y !== c))} aria-label={`Remove ${c}`}><X size={13} /></button></span>
                    ))}
                  </div>
                  <form onSubmit={(e) => { e.preventDefault(); if (other.trim()) { setConds((x) => [...x, other.trim()]); setOther(""); } }} className="mt-2 flex gap-2">
                    <input value={other} onChange={(e) => setOther(e.target.value)} placeholder={t.other} className={input} />
                    <button type="submit" className="grid size-12 shrink-0 place-items-center rounded-2xl border border-line" aria-label="Add"><Plus size={16} /></button>
                  </form></div>
                <div><span className="text-[13px] text-muted">{t.meds}</span>
                  <ul className="mt-2 space-y-2">
                    {meds.map((m, i) => {
                      const upd = (p: Partial<Med>) => setMeds((x) => x.map((y, j) => (j === i ? { ...y, ...p } : y)));
                      return (
                        <li key={i} className="rounded-2xl border border-line p-3">
                          <div className="flex gap-2">
                            <input value={m.name} onChange={(e) => upd({ name: e.target.value })} placeholder={t.medName} className={cx(input, "h-11")} />
                            <input value={m.dose} onChange={(e) => upd({ dose: e.target.value })} placeholder={t.dose} className={cx(input, "h-11 w-28")} />
                            <button type="button" onClick={() => setMeds((x) => x.filter((_, j) => j !== i))} className="grid size-11 shrink-0 place-items-center text-muted hover:text-critical" aria-label="Remove"><Trash2 size={15} /></button>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">{SLOTS.map(([k, hhmm]) => {
                            const on = m.times.includes(hhmm);
                            return <button key={k} type="button" aria-pressed={on} onClick={() => upd({ times: on ? m.times.filter((x) => x !== hhmm) : [...m.times, hhmm].sort() })}
                              className={cx("h-9 rounded-full border px-3 text-[13px]", on ? "border-teal bg-teal-soft text-teal" : "border-line text-muted")}>{t[k]}</button>;
                          })}</div>
                        </li>
                      );
                    })}
                  </ul>
                  <button type="button" onClick={() => setMeds((x) => [...x, { name: "", dose: "", times: ["08:00"] }])} className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-full border border-line px-4 text-[13px]"><Plus size={14} aria-hidden />{t.addMed}</button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t.hr} unit="bpm" value={v.hr} need={!v.hr} onChange={(x) => setVital("hr", x)} />
                  <Field label={t.spo2} unit="%" value={v.spo2} need={!v.spo2} onChange={(x) => setVital("spo2", x)} />
                  <Field label={`${t.bp} · ${t.sys}`} unit="mmHg" value={v.sbp} need={!v.sbp} onChange={(x) => setVital("sbp", x)} />
                  <Field label={`${t.bp} · ${t.dia}`} unit="mmHg" value={v.dbp} need={!v.dbp} onChange={(x) => setVital("dbp", x)} />
                  <div>
                    <Field label={t.temp} unit={fahrenheit ? "°F" : "°C"} value={v.temp} need={!v.temp} onChange={(x) => setVital("temp", x)} />
                    <button type="button" onClick={() => setF((f) => !f)} className="mt-1 text-[12px] text-teal">{fahrenheit ? "°C" : "°F"}?</button>
                  </div>
                  <Field label={t.rr} unit="/min" value={v.rr} need={!v.rr} onChange={(x) => setVital("rr", x)} />
                  <Field label={t.glucose} unit="mg/dL" value={v.glucose} need={false} onChange={(x) => setVital("glucose", x)} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <TapCounter icon={HeartPulse} label={t.tapPulse} hint={t.tapHintPulse} seconds={15} t={t} onResult={(n) => setVital("hr", n)} />
                  <TapCounter icon={Wind} label={t.tapBreath} hint={t.tapHintBreath} seconds={30} t={t} onResult={(n) => setVital("rr", n)} />
                </div>
                <div><span className="text-[13px] text-muted">{t.feel}</span>
                  <div className="mt-2 flex flex-wrap gap-2">{QUICK.map((k) => {
                    const on = symptoms.includes(k);
                    const red = RED_FLAG_SYMPTOMS.has(k);
                    return <button key={k} type="button" aria-pressed={on} onClick={() => setSymptoms((x) => (on ? x.filter((y) => y !== k) : [...x, k]))}
                      className={cx("h-10 rounded-full border px-4 text-[14px]", on ? (red ? "border-critical bg-critical-soft text-critical" : "border-teal bg-teal-soft text-teal") : "border-line")}>{SYMPTOM_LABEL[k][lang]}</button>;
                  })}</div>
                  {symptoms.some((k) => RED_FLAG_SYMPTOMS.has(k)) && <p className="mt-3 rounded-2xl bg-critical-soft px-4 py-3 text-[14px] font-medium text-critical">{t.redflag}</p>}
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="rounded-3xl border border-line bg-surface p-5 text-[14px] leading-relaxed">
                  <div className="text-[18px] font-medium">{name} · {age} · {sex === "F" ? t.female : t.male}</div>
                  <div className="mt-1 text-muted">{hospitals.data?.find((h) => h.id === site)?.name}</div>
                  {conds.length > 0 && <div className="mt-3">{conds.join(" · ")}</div>}
                  <div className="mt-3 font-mono text-[13px]">HR {v.hr} · SpO₂ {v.spo2}% · BP {v.sbp}/{v.dbp} · {v.temp}{fahrenheit ? "°F" : "°C"} · RR {v.rr}{v.glucose ? ` · ${v.glucose} mg/dL` : ""}</div>
                  {meds.length > 0 && <div className="mt-2 text-muted">{meds.map((m) => m.name).filter(Boolean).join(", ")}</div>}
                </div>
                <label className="flex items-start gap-3 rounded-2xl border border-line p-4">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 size-5 accent-[var(--teal)]" />
                  <span className="text-[14px] leading-relaxed">{t.consent}</span>
                </label>
              </>
            )}

            {step === 4 && done && <Done done={done} doctor={doctorById[done.doctor]} t={t} />}
          </motion.div>
        </AnimatePresence>

        {msg && <p className="mt-4 text-[13px] text-teal" role="status">{msg}</p>}
        {step < 4 && (
          <div className="mt-8 flex items-center gap-3">
            {step > 0 && <button type="button" onClick={() => setStep((s) => s - 1)} className="inline-flex h-12 items-center gap-2 rounded-full px-4 text-[14px] text-muted hover:text-ink"><ArrowLeft size={16} aria-hidden />{t.back}</button>}
            {step === 2 && need.length > 0 && <span className="text-[12px] text-watch">{t.need}</span>}
            {step < 3 ? (
              <button type="button" disabled={!canNext} onClick={() => setStep((s) => s + 1)} className="ml-auto inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-bg hover:bg-teal disabled:opacity-40">{t.next}<ArrowRight size={16} aria-hidden /></button>
            ) : (
              <button type="button" disabled={!consent || busy} onClick={submit} className="ml-auto inline-flex h-12 items-center gap-2 rounded-full bg-teal px-6 text-[15px] font-medium text-bg disabled:opacity-40"><UserPlus size={17} aria-hidden />{busy ? "…" : t.submit}</button>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}

function Field({ label, unit, value, need, onChange }: { label: string; unit: string; value?: string; need: boolean; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[13px] text-muted">{label} {need && <span className="text-watch">•</span>}</span>
      <div className={cx("mt-1 flex items-center rounded-2xl border bg-bg focus-within:border-teal", need ? "border-watch/50" : "border-line")}>
        <input inputMode="decimal" value={value ?? ""} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))} className="h-12 w-full bg-transparent px-4 font-mono text-[17px] outline-none" aria-label={label} />
        <span className="pr-4 font-mono text-[12px] text-muted">{unit}</span>
      </div>
    </label>
  );
}

/** Tap along with your pulse or breathing; the count is scaled to one minute. */
function TapCounter({ icon: Icon, label, hint, seconds, t, onResult }: {
  icon: typeof HeartPulse; label: string; hint: string; seconds: number; t: (typeof T)["en"]; onResult: (perMin: number) => void;
}) {
  const reduce = useReducedMotion();
  const [left, setLeft] = useState<number | null>(null);
  const [taps, setTaps] = useState(0);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (left === null) return;
    if (left <= 0) {
      onResult(Math.round((taps * 60) / seconds));
      setLeft(null);
      return;
    }
    const id = window.setTimeout(() => setLeft((l) => (l === null ? null : l - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [left]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2 text-[14px] font-medium"><Icon size={16} className="text-teal" aria-hidden />{label}</div>
      <p className="mt-1 text-[12px] text-muted">{hint}</p>
      {left === null ? (
        <button type="button" onClick={() => { setTaps(0); setLeft(seconds); }} className="mt-3 h-11 w-full rounded-xl border border-line text-[14px] hover:border-teal">{t.start}</button>
      ) : (
        <motion.button type="button" key={pulse} onClick={() => { setTaps((n) => n + 1); setPulse((p) => p + 1); }}
          initial={reduce ? false : { scale: 0.94 }} animate={{ scale: 1 }}
          className="mt-3 flex h-20 w-full flex-col items-center justify-center rounded-xl bg-teal text-bg">
          <span className="font-display text-[28px] leading-none tnum">{taps}</span>
          <span className="text-[11px] opacity-80">{t.tap} · {left} {t.seconds}</span>
        </motion.button>
      )}
    </div>
  );
}

function Done({ done, doctor, t }: { done: { id: string; level: Level; score: number; reason: string }; doctor?: { name: string; specialty: string }; t: (typeof T)["en"] }) {
  const s = LEVEL_STYLE[done.level];
  return (
    <div className={cx("rounded-[28px] p-7", s.soft)}>
      <div className="flex items-center gap-3">
        <ShieldCheck size={30} className={s.text} aria-hidden />
        <div className="font-display text-[34px] leading-none">{t.doneTitle}</div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className={cx("rounded-full bg-surface px-3 py-1 text-[14px] font-medium", s.text)}>{done.level} · {done.score}</span>
        <span className="font-mono text-[12px] text-muted">{done.id}</span>
      </div>
      <div className="mt-5 rounded-2xl bg-surface p-4">
        <div className="text-[12px] text-muted">{t.yourDoctor}</div>
        <div className="mt-1 text-[18px] font-medium">{doctor ? `${doctor.name} · ${doctor.specialty}` : "—"}</div>
        {done.reason && <div className="mt-1 text-[12px] text-muted">{done.reason}</div>}
      </div>
      <Link to={`/patient/${done.id}`} className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-bg hover:bg-teal">{t.goDash}<ArrowRight size={16} aria-hidden /></Link>
    </div>
  );
}
