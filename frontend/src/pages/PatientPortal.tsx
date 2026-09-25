import { motion } from "framer-motion";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Shell } from "../components/Shell";
import { Card, EmptyState, ErrorState, Eyebrow, Skeleton, cx } from "../components/ui";
import { api, useQuery } from "../lib/api";
import { DISCLAIMER, LEVEL_STYLE, fmtTime, fmtVital, initials, istDateKey } from "../lib/format";
import type { Level } from "../lib/types";

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
  en: { hello: "Namaste", readings: "Your latest readings", meds: "Today's medicines", taken: "Taken", missed: "Missed", due: "Due", none: "No medicines scheduled today.", asha: "ASHA worker mode", ashaBody: "Health workers can use this same screen on a shared phone to check on patients in villages, in Hindi or English.", hr: "Heart rate", spo2: "Oxygen", bp: "Blood pressure", temp: "Temperature" },
  hi: { hello: "नमस्ते", readings: "आपकी ताज़ा रीडिंग", meds: "आज की दवाइयाँ", taken: "ली गई", missed: "छूट गई", due: "लेनी है", none: "आज कोई दवा नहीं है।", asha: "आशा कार्यकर्ता मोड", ashaBody: "स्वास्थ्य कार्यकर्ता इसी स्क्रीन से गाँव में मरीज़ों की जाँच कर सकते हैं — हिंदी या अंग्रेज़ी में।", hr: "धड़कन", spo2: "ऑक्सीजन", bp: "ब्लड प्रेशर", temp: "तापमान" },
};

export function PatientPicker() {
  const patients = useQuery((s) => api.patients(s), []);
  return (
    <Shell>
      <div className="mx-auto max-w-3xl px-4 pt-14 pb-24 sm:px-8">
        <Eyebrow>Patient view · demo sign-in</Eyebrow>
        <h1 className="mt-3 font-display text-[clamp(44px,6vw,80px)] leading-none tracking-[-0.02em]">Who are you?</h1>
        <p className="mt-3 text-[15px] text-muted">Pick your name to see your status. <span className="text-ink-2">अपना नाम चुनें।</span></p>
        <div className="mt-10 divide-y divide-line border-y border-line">
          {patients.error && !patients.data ? (
            <div className="py-6"><ErrorState error={patients.error} onRetry={patients.reload} /></div>
          ) : !patients.data ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="my-3 h-12" />)
          ) : (
            [...patients.data].sort((a, b) => a.name.localeCompare(b.name)).map((p, i) => (
              <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Link to={`/patient/${p.id}`} className="group flex items-center gap-4 py-4">
                  <span className="grid size-10 place-items-center rounded-full bg-surface-2 font-mono text-[12px] text-ink-2 transition-colors group-hover:bg-teal-soft group-hover:text-teal">{initials(p.name)}</span>
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
  const patient = useQuery((s) => api.patient(id, s), [id], 15_000);
  const meds = useQuery((s) => api.medications(id, s), [id], 30_000);
  const [lang, setLang] = useState<Lang | null>(null);
  const p = patient.data;
  const l: Lang = lang ?? p?.language ?? "en";
  const t = T[l];

  if (patient.error && !p) {
    return <Shell><div className="mx-auto max-w-xl px-4 py-24"><ErrorState error={patient.error} onRetry={patient.reload} /></div></Shell>;
  }

  const status = p ? STATUS[p.risk.level][l] : null;
  const today = p ? istDateKey(p.latest.ts) : "";
  const todays = meds.data?.flatMap((m) => m.doses.filter((d) => istDateKey(d.scheduled_at) === today).map((d) => ({ m, d })))
    .sort((a, b) => a.d.scheduled_at.localeCompare(b.d.scheduled_at));

  return (
    <Shell>
      <div lang={l} className="mx-auto max-w-3xl px-4 pt-10 pb-24 sm:px-8">
        <div className="flex items-center justify-between">
          <Link to="/patient" className="text-[13px] text-muted hover:text-ink">← {l === "hi" ? "नाम बदलें" : "Not you?"}</Link>
          <div className="flex rounded-full border border-line p-1" role="group" aria-label="Language">
            {(["en", "hi"] as Lang[]).map((x) => (
              <button key={x} type="button" onClick={() => setLang(x)} className={cx("relative h-8 rounded-full px-4 text-[13px]", l === x ? "text-bg" : "text-muted hover:text-ink")}>
                {l === x && <motion.span layoutId="lang-pill" className="absolute inset-0 rounded-full bg-ink" />}
                <span className="relative">{x === "en" ? "English" : "हिंदी"}</span>
              </button>
            ))}
          </div>
        </div>

        {!p || !status ? (
          <Skeleton className="mt-10 h-72 rounded-[28px]" />
        ) : (
          <motion.div key={l + p.risk.level} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className={cx("mt-10 rounded-[28px] p-8 sm:p-10", LEVEL_STYLE[p.risk.level].soft)}>
            <div className="eyebrow">{t.hello}, {p.name.split(" ")[0]}</div>
            <h1 className={cx("mt-4 font-display text-[clamp(40px,6vw,68px)] leading-[1.02] tracking-[-0.015em]", LEVEL_STYLE[p.risk.level].text)}>{status.title}</h1>
            <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-ink">{status.body}</p>
          </motion.div>
        )}

        {p && (
          <section className="mt-10">
            <Eyebrow>{t.readings} · {fmtTime(p.latest.ts)}</Eyebrow>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                [t.hr, fmtVital("hr", p.latest.hr), "bpm"],
                [t.spo2, fmtVital("spo2", p.latest.spo2), "%"],
                [t.bp, `${fmtVital("sbp", p.latest.sbp)}/${fmtVital("dbp", p.latest.dbp)}`, "mmHg"],
                [t.temp, fmtVital("temp", p.latest.temp), "°C"],
              ].map(([label, value, unit]) => (
                <Card key={label} className="px-4 py-4">
                  <div className="text-[12px] text-muted">{label}</div>
                  <div className="mt-1 font-mono text-[24px] leading-none tnum">{value}<span className="ml-1 text-[11px] text-muted">{unit}</span></div>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section className="mt-10">
          <Eyebrow>{t.meds}</Eyebrow>
          <div className="mt-4">
            {meds.error && !meds.data ? <ErrorState error={meds.error} onRetry={meds.reload} /> : !todays ? <Skeleton className="h-32" /> : todays.length === 0 ? (
              <EmptyState title={t.none} />
            ) : (
              <div className="divide-y divide-line rounded-3xl border border-line bg-surface">
                {todays.map(({ m, d }) => (
                  <div key={d.id} className="flex items-center gap-4 px-5 py-4">
                    <span className="w-14 font-mono text-[14px] tnum text-muted">{fmtTime(d.scheduled_at)}</span>
                    <div className="flex-1">
                      <div className="text-[15px] font-medium">{m.name} <span className="font-normal text-muted">{m.dose}</span></div>
                      <div className="text-[12px] text-muted">{m.purpose}</div>
                    </div>
                    <span className={cx("rounded-full px-3 py-1 text-[12px]",
                      d.status === "taken" && "bg-teal-soft text-teal",
                      d.status === "missed" && "bg-critical-soft text-critical",
                      d.status === "pending" && "border border-line-2 text-muted")}>
                      {d.status === "taken" ? t.taken : d.status === "missed" ? t.missed : t.due}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="mt-10 rounded-3xl border border-dashed border-line-2 p-6">
          <div className="eyebrow text-teal">{t.asha}</div>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{t.ashaBody}</p>
        </section>
        <p className="mt-8 text-[12px] leading-relaxed text-muted">{DISCLAIMER}</p>
      </div>
    </Shell>
  );
}
