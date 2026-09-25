import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { Shell } from "../components/Shell";
import { ClipboardList, HandHeart, Languages, NotebookPen, Send, TriangleAlert, UserRound } from "lucide-react";
import { VITAL_ICON, ic } from "../components/icons";
import { PatientArt } from "../components/Illustrations";
import { AdherenceTracker, AssistantChat, DailyCard, HealthSummary, Overview, Prescriptions, PulseOxTracker, WeatherCard } from "../components/PatientDashboard";
import { ErrorState, Eyebrow, Skeleton, cx } from "../components/ui";
import { api, useQuery } from "../lib/api";
import { DISCLAIMER, RED_FLAG_SYMPTOMS, SYMPTOM_LABEL, initials } from "../lib/format";
import { useLive } from "../lib/live";
import type { Level, VitalKey, VitalsInput } from "../lib/types";

type Lang = "en" | "hi";

const STATUS: Record<Level, Record<Lang, { title: string; body: string }>> = {
  Stable: {
    en: { title: "You're doing well.", body: "Your readings are within your usual range. Keep taking your medicines on time." },
    hi: { title: "आप ठीक हैं।", body: "आपकी रीडिंग आपकी सामान्य सीमा में है। अपनी दवाइयाँ समय पर लेते रहें।" },
  },
  Watch: {
    en: { title: "We're keeping a closer eye.", body: "Some readings are a little different from your usual. Your care team can see this." },
    hi: { title: "हम ध्यान से नज़र रख रहे हैं।", body: "कुछ रीडिंग आपकी सामान्य रीडिंग से थोड़ी अलग हैं। आपकी देखभाल टीम इसे देख रही है।" },
  },
  Warning: {
    en: { title: "A doctor will see you soon.", body: "Your readings have changed. A doctor should review you within the hour." },
    hi: { title: "डॉक्टर जल्द ही आपको देखेंगे।", body: "आपकी रीडिंग में बदलाव आया है। एक घंटे के भीतर डॉक्टर को आपको देखना चाहिए।" },
  },
  Critical: {
    en: { title: "Please tell a nurse now.", body: "Your readings need attention right away. Tell the nurse how you are feeling." },
    hi: { title: "कृपया अभी नर्स को बताएं।", body: "आपकी रीडिंग पर तुरंत ध्यान देना ज़रूरी है। नर्स को बताएं कि आप कैसा महसूस कर रहे हैं।" },
  },
};

const T = {
  en: {
    hello: "Namaste", readings: "Your latest readings", meds: "Today's medicines", taken: "Taken", missed: "Missed", due: "Due",
    markTaken: "Mark as taken", saving: "Saving…", none: "No medicines scheduled today.",
    asha: "ASHA worker mode", ashaOn: (n: string) => `Recording for ${n} as an ASHA worker`,
    ashaBody: "Health workers can use this same screen on a shared phone to check on patients in villages, in Hindi or English. Readings and symptoms they enter are marked as recorded by an ASHA worker.",
    hr: "Heart rate", spo2: "Oxygen", bp: "Blood pressure", sys: "Top (systolic)", dia: "Bottom (diastolic)", temp: "Temperature", glucose: "Blood sugar",
    logTitle: "Log a reading", logHint: "Fill in only what you measured. Temperature in °C or °F.", save: "Save reading",
    saved: "Saved — your care team can see it.", needOne: "Enter at least one reading.", outOfRange: (f: string) => `${f} looks out of range — please check it.`,
    feel: "How are you feeling?", feelHint: "Tick anything you have right now.", send: "Send to my care team",
    sent: "Sent — your care team can see it.", pickOne: "Tick at least one symptom.",
    redflag: "This can be serious. Please tell a nurse or call for help now.", notYou: "Not you?",
  },
  hi: {
    hello: "नमस्ते", readings: "आपकी ताज़ा रीडिंग", meds: "आज की दवाइयाँ", taken: "ली गई", missed: "छूट गई", due: "लेनी है",
    markTaken: "ले ली", saving: "सेव हो रहा है…", none: "आज कोई दवा नहीं है।",
    asha: "आशा कार्यकर्ता मोड", ashaOn: (n: string) => `आशा कार्यकर्ता के रूप में ${n} के लिए दर्ज कर रहे हैं`,
    ashaBody: "स्वास्थ्य कार्यकर्ता इसी स्क्रीन से गाँव में मरीज़ों की जाँच कर सकते हैं — हिंदी या अंग्रेज़ी में। उनके द्वारा दर्ज रीडिंग और लक्षण 'आशा कार्यकर्ता' के नाम से दिखते हैं।",
    hr: "धड़कन", spo2: "ऑक्सीजन", bp: "ब्लड प्रेशर", sys: "ऊपर वाला (सिस्टोलिक)", dia: "नीचे वाला (डायस्टोलिक)", temp: "तापमान", glucose: "ब्लड शुगर",
    logTitle: "रीडिंग दर्ज करें", logHint: "सिर्फ़ वही भरें जो आपने नापा है। तापमान °C या °F में।", save: "रीडिंग सेव करें",
    saved: "सेव हो गया — आपकी देखभाल टीम इसे देख सकती है।", needOne: "कम से कम एक रीडिंग भरें।", outOfRange: (f: string) => `${f} सही नहीं लग रहा — कृपया जाँच लें।`,
    feel: "आप कैसा महसूस कर रहे हैं?", feelHint: "अभी जो भी तकलीफ़ है, उस पर टिक करें।", send: "देखभाल टीम को भेजें",
    sent: "भेज दिया — आपकी देखभाल टीम इसे देख सकती है।", pickOne: "कम से कम एक लक्षण चुनें।",
    redflag: "यह गंभीर हो सकता है। कृपया अभी नर्स को बताएं या मदद बुलाएं।", notYou: "नाम बदलें",
  },
};

type FieldKey = "hr" | "spo2" | "sbp" | "dbp" | "temp" | "glucose";
const FIELDS: { key: FieldKey; label: (t: (typeof T)["en"]) => string; unit: string; min: number; max: number; step: string }[] = [
  { key: "hr", label: (t) => t.hr, unit: "bpm", min: 20, max: 250, step: "1" },
  { key: "spo2", label: (t) => t.spo2, unit: "%", min: 50, max: 100, step: "1" },
  { key: "sbp", label: (t) => `${t.bp} · ${t.sys}`, unit: "mmHg", min: 50, max: 260, step: "1" },
  { key: "dbp", label: (t) => `${t.bp} · ${t.dia}`, unit: "mmHg", min: 30, max: 160, step: "1" },
  { key: "temp", label: (t) => t.temp, unit: "°C / °F", min: 32, max: 43, step: "0.1" },
  { key: "glucose", label: (t) => t.glucose, unit: "mg/dL", min: 20, max: 600, step: "1" },
];

const SYMPTOM_ORDER = Object.keys(SYMPTOM_LABEL).sort((a, b) => Number(RED_FLAG_SYMPTOMS.has(b)) - Number(RED_FLAG_SYMPTOMS.has(a)));

// Friendly, varied avatar colours for the name list (decorative accents only, never risk colours).
const AVATAR = ["bg-teal-soft text-teal", "bg-violet-soft text-violet", "bg-sky-soft text-sky", "bg-pink-soft text-pink"];

export function PatientPicker() {
  const patients = useQuery((s) => api.patients(s), []);
  return (
    <Shell>
      <div className="mx-auto max-w-3xl px-4 pt-14 pb-24 sm:px-8">
        <div className="flex flex-col-reverse gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Eyebrow icon={UserRound}>Patient view · demo sign-in</Eyebrow>
            <h1 className="mt-3 font-display text-[clamp(44px,6vw,80px)] leading-none tracking-[-0.02em]">Who are you?</h1>
            <p className="mt-3 text-[15px] text-muted">Pick your name to see your status. <span className="text-ink-2">अपना नाम चुनें।</span></p>
          </div>
          <PatientArt className="w-48 shrink-0 self-center sm:w-56 sm:self-auto" />
        </div>
        <div className="mt-10 divide-y divide-line border-y border-line">
          {patients.error && !patients.data ? (
            <div className="py-6"><ErrorState error={patients.error} onRetry={patients.reload} /></div>
          ) : !patients.data ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="my-3 h-12" />)
          ) : (
            [...patients.data].sort((a, b) => a.name.localeCompare(b.name)).map((p, i) => (
              <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Link to={`/patient/${p.id}`} className="group flex items-center gap-4 py-4">
                  <span className={cx("grid size-10 place-items-center rounded-full font-mono text-[12px] transition-transform duration-300 group-hover:scale-110", AVATAR[i % AVATAR.length])}>{initials(p.name)}</span>
                  <span className="flex-1 text-[17px] transition-transform duration-300 group-hover:translate-x-1">{p.name}</span>
                  <span className="font-mono text-[12px] text-muted">{p.bed}</span>
                  <span className="text-muted transition-all duration-300 group-hover:translate-x-1 group-hover:text-teal">→</span>
                </Link>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </Shell>
  );
}

export function PatientHome() {
  const { id = "" } = useParams();
  const patient = useQuery((s) => api.patient(id, s), [id], 30_000);
  const risk = useQuery((s) => api.risk(id, s), [id], 30_000);
  const meds = useQuery((s) => api.medications(id, s), [id], 60_000);
  const vitals = useQuery((s) => api.vitals(id, "24h", 96, s), [id], 60_000);
  const symptoms = useQuery((s) => api.symptoms(id, s), [id], 60_000);
  const [lang, setLang] = useState<Lang | null>(null);
  const [asha, setAsha] = useState(false);
  const p = patient.data;
  const l: Lang = lang ?? p?.language ?? "en";
  const t = T[l];
  const source = asha ? "asha" : "patient";

  // Live: the dashboard follows the ward stream (throttled), the plain sentence comes from the explainer.
  const live = useLive();
  const tick = live.patients[id]?.vitals.ts;
  const lastFast = useRef(0);
  const lastSlow = useRef(0);
  useEffect(() => {
    if (!tick) return;
    const now = Date.now();
    if (now - lastFast.current >= 3000) {
      lastFast.current = now;
      patient.reload();
      risk.reload();
    }
    if (now - lastSlow.current >= 10_000) {
      lastSlow.current = now;
      vitals.reload();
      meds.reload();
      symptoms.reload();
    }
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const refreshAll = () => {
    patient.reload();
    risk.reload();
    vitals.reload();
    meds.reload();
    symptoms.reload();
  };
  const level = p?.risk.level;
  const bucket = p ? Math.floor(p.risk.score / 5) : -1;
  const explanation = useQuery((s) => api.explanation(id, l, s), [id, l, level, bucket]);

  if (patient.error && !p) {
    return <Shell><div className="mx-auto max-w-xl px-4 py-24"><ErrorState error={patient.error} onRetry={patient.reload} /></div></Shell>;
  }

  const status = p ? STATUS[p.risk.level][l] : null;
  const hr = live.patients[id]?.vitals.hr ?? p?.latest.hr;
  const recentSymptoms = symptoms.data?.length;

  return (
    <Shell>
      <div lang={l} className="mx-auto max-w-6xl px-4 pt-10 pb-28 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to="/patient" className="text-[13px] text-muted hover:text-ink">← {t.notYou}</Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAsha((a) => !a)}
              aria-pressed={asha}
              className={cx("inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[13px] transition-colors", asha ? "border-teal bg-teal-soft text-teal" : "border-line text-muted hover:text-ink")}
            >
              <HandHeart {...ic(15)} />
              {t.asha}
            </button>
            <div className="flex items-center rounded-full border border-line p-1" role="group" aria-label="Language">
              <Languages {...ic(14)} className="mx-2 text-muted" />
              {(["en", "hi"] as Lang[]).map((x) => (
                <button key={x} type="button" onClick={() => setLang(x)} aria-pressed={l === x}
                  className={cx("h-8 rounded-full px-4 text-[13px] transition-colors duration-200", l === x ? "bg-ink text-bg" : "text-muted hover:text-ink")}>
                  {x === "en" ? "English" : "हिंदी"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {asha && p && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="mt-4 overflow-hidden rounded-2xl border border-teal/40 bg-teal-soft px-4 py-3 text-[14px] text-teal">
              <span className="flex items-center gap-2"><HandHeart {...ic(16)} className="shrink-0" />{t.ashaOn(p.name)}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 5 · Today + 6 · Weather */}
        <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          {p ? <DailyCard lang={l} name={p.name.split(" ")[0]} /> : <Skeleton className="h-52 rounded-3xl" />}
          {p ? <WeatherCard lang={l} conditions={p.conditions} /> : <Skeleton className="h-52 rounded-3xl" />}
        </div>

        {/* 7 · AI health summary with the glowing heart */}
        <div className="mt-4">
          {!p || !status ? (
            <Skeleton className="h-72 rounded-[28px]" />
          ) : (
            <HealthSummary
              risk={risk.data}
              lang={l}
              hr={hr}
              title={status.title}
              sentence={explanation.data?.lang === l && explanation.data.level === p.risk.level ? explanation.data.patient : status.body}
            />
          )}
        </div>

        {/* 4 · Overall health */}
        {p && (
          <div className="mt-10">
            <Overview p={p} risk={risk.data} vitals={vitals.data} symptomsCount={recentSymptoms} lang={l}
              labels={{ hr: t.hr, spo2: t.spo2, bp: t.bp, temp: t.temp }} />
          </div>
        )}

        {/* 1 · Prescriptions + 2 · Doses & adherence */}
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          {meds.error && !meds.data ? (
            <div className="lg:col-span-2"><ErrorState error={meds.error} onRetry={meds.reload} /></div>
          ) : (
            <>
              <Prescriptions meds={meds.data} lang={l} now={p?.latest.ts} />
              <AdherenceTracker meds={meds.data} lang={l} now={p?.latest.ts} onChanged={refreshAll} />
            </>
          )}
        </div>

        {/* 3 · Heart rate & SpO₂ */}
        <div className="mt-4">
          <PulseOxTracker patientId={id} vitals={vitals.data} source={source} lang={l} onSaved={refreshAll} />
        </div>

        <div className="grid gap-x-4 lg:grid-cols-2">
          {p && <LogReading patientId={id} source={source} t={t} onSaved={refreshAll} />}
          {p && <SymptomChecklist patientId={id} source={source} lang={l} t={t} onSent={refreshAll} />}
        </div>

        <section className="mt-10 flex flex-col items-center gap-4 rounded-3xl border border-dashed border-line-2 p-6 sm:flex-row sm:gap-6">
          <PatientArt className="w-44 shrink-0" />
          <div>
            <div className="eyebrow flex items-center gap-2 text-teal"><HandHeart {...ic(14)} />{t.asha}</div>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{t.ashaBody}</p>
          </div>
        </section>
        <p className="mt-8 text-[12px] leading-relaxed text-muted">{DISCLAIMER}</p>
      </div>
      {/* 8 · Assistant */}
      {p && <AssistantChat patientId={id} lang={l} />}
    </Shell>
  );
}

type Texts = (typeof T)["en"];

function VitalIcon({ k }: { k: VitalKey }) {
  const Icon = VITAL_ICON[k];
  return <Icon {...ic(13)} className="shrink-0" />;
}



function LogReading({ patientId, source, t, onSaved }: { patientId: string; source: "patient" | "asha"; t: Texts; onSaved: () => void }) {
  const [values, setValues] = useState<Partial<Record<FieldKey, string>>>({});
  const [state, setState] = useState<{ kind: "idle" | "busy" | "ok" | "error"; msg?: string }>({ kind: "idle" });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const out: VitalsInput = {};
    for (const f of FIELDS) {
      const raw = values[f.key]?.trim();
      if (!raw) continue;
      let n = Number(raw.replace(",", "."));
      if (f.key === "temp" && n > 45) n = Math.round(((n - 32) * 5) / 9 * 10) / 10; // typed in °F
      if (!Number.isFinite(n) || n < f.min || n > f.max) {
        setState({ kind: "error", msg: t.outOfRange(f.label(t)) });
        return;
      }
      out[f.key] = n;
    }
    if (Object.keys(out).length === 0) {
      setState({ kind: "error", msg: t.needOne });
      return;
    }
    setState({ kind: "busy" });
    try {
      await api.logVitals(patientId, out, source);
      setValues({});
      setState({ kind: "ok", msg: t.saved });
      onSaved();
    } catch (err) {
      setState({ kind: "error", msg: (err as Error).message });
    }
  };

  return (
    <section className="mt-10">
      <Eyebrow icon={NotebookPen}>{t.logTitle}</Eyebrow>
      <form onSubmit={submit} className="mt-4 rounded-3xl border border-line bg-surface p-5" noValidate>
        <p className="text-[13px] text-muted">{t.logHint}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="flex items-center gap-1.5 text-[12px] text-muted"><VitalIcon k={f.key} />{f.label(t)}</span>
              <div className="mt-1 flex items-center rounded-xl border border-line bg-bg focus-within:border-line-2">
                <input
                  inputMode="decimal"
                  value={values[f.key] ?? ""}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [f.key]: e.target.value }));
                    if (state.kind !== "busy") setState({ kind: "idle" });
                  }}
                  className="h-11 w-full bg-transparent px-3 font-mono text-[16px] outline-none"
                  aria-label={f.label(t)}
                />
                <span className="pr-3 font-mono text-[11px] whitespace-nowrap text-muted">{f.unit}</span>
              </div>
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={state.kind === "busy"} className="h-11 rounded-full bg-ink px-6 text-[14px] font-medium text-bg transition-colors hover:bg-teal disabled:opacity-60">
            {state.kind === "busy" ? t.saving : t.save}
          </button>
          {state.msg && <span className={cx("text-[13px]", state.kind === "error" ? "text-critical" : "text-stable")} role="status">{state.msg}</span>}
        </div>
      </form>
    </section>
  );
}

function SymptomChecklist({ patientId, source, lang, t, onSent }: { patientId: string; source: "patient" | "asha"; lang: Lang; t: Texts; onSent: () => void }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [state, setState] = useState<{ kind: "idle" | "busy" | "ok" | "error"; msg?: string; redFlag?: boolean }>({ kind: "idle" });

  const toggle = (k: string) => {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
    if (state.kind !== "busy") setState({ kind: "idle" });
  };

  const send = async () => {
    if (picked.size === 0) {
      setState({ kind: "error", msg: t.pickOne });
      return;
    }
    setState({ kind: "busy" });
    try {
      const list = [...picked];
      await api.reportSymptoms(patientId, list, source);
      setPicked(new Set());
      setState({ kind: "ok", msg: t.sent, redFlag: list.some((k) => RED_FLAG_SYMPTOMS.has(k)) });
      onSent();
    } catch (err) {
      setState({ kind: "error", msg: (err as Error).message });
    }
  };

  const redPicked = [...picked].some((k) => RED_FLAG_SYMPTOMS.has(k));

  return (
    <section className="mt-10">
      <Eyebrow icon={ClipboardList}>{t.feel}</Eyebrow>
      <div className="mt-4 rounded-3xl border border-line bg-surface p-5">
        <p className="text-[13px] text-muted">{t.feelHint}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {SYMPTOM_ORDER.map((k) => {
            const on = picked.has(k);
            const red = RED_FLAG_SYMPTOMS.has(k);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(k)}
                className={cx(
                  "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[14px] transition-colors",
                  on ? (red ? "border-critical bg-critical-soft text-critical" : "border-teal bg-teal-soft text-teal") : "border-line hover:border-line-2",
                )}
              >
                {red && <span className="size-1.5 rounded-full bg-critical" aria-hidden />}
                {SYMPTOM_LABEL[k][lang]}
              </button>
            );
          })}
        </div>
        {(redPicked || state.redFlag) && (
          <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-critical-soft px-4 py-3 text-[14px] font-medium text-critical" role="alert">
            <TriangleAlert {...ic(18)} className="mt-px shrink-0" />
            {t.redflag}
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={send} disabled={state.kind === "busy"} className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-6 text-[14px] font-medium text-bg transition-colors hover:bg-teal disabled:opacity-60">
            <Send {...ic(15)} />
            {state.kind === "busy" ? t.saving : t.send}
          </button>
          {state.msg && <span className={cx("text-[13px]", state.kind === "error" ? "text-critical" : "text-stable")} role="status">{state.msg}</span>}
        </div>
      </div>
    </section>
  );
}
