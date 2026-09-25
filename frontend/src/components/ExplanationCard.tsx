import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { api, useQuery } from "../lib/api";
import { LEVEL_STYLE } from "../lib/format";
import type { Level } from "../lib/types";
import { ErrorState, Eyebrow, Skeleton, cx } from "./ui";

type Lang = "en" | "hi";

const LABELS: Record<Lang, { doctor: string; patient: string }> = {
  en: { doctor: "For the doctor", patient: "For the patient" },
  hi: { doctor: "डॉक्टर के लिए", patient: "मरीज़ के लिए" },
};

/**
 * The plain-language explanation of the live score. It refetches when the risk picture
 * changes (level, or the score moving by 5+), not on every tick.
 */
export function ExplanationCard({ patientId, level, score }: { patientId: string; level?: Level; score?: number }) {
  const [lang, setLang] = useState<Lang>("en");
  const bucket = score === undefined ? -1 : Math.floor(score / 5);
  const q = useQuery((s) => api.explanation(patientId, lang, s), [patientId, lang, level, bucket]);
  const e = q.data;
  const t = LABELS[lang];

  return (
    <div className="rounded-3xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Eyebrow>Explanation</Eyebrow>
          {e && (
            <span
              className={cx(
                "rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em]",
                e.source === "gemini" ? "bg-teal-soft text-teal" : "bg-surface-2 text-muted",
              )}
              title={e.source === "gemini" ? `Written by ${e.model}` : "Gemini is off or unavailable; AYU's built-in explanation"}
            >
              {e.source === "gemini" ? `Gemini · ${e.model}` : "Built-in · offline"}
            </span>
          )}
        </div>
        <div className="flex rounded-full border border-line p-1" role="group" aria-label="Explanation language">
          {(["en", "hi"] as Lang[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              className={cx("h-8 rounded-full px-4 text-[13px] transition-colors duration-200", lang === l ? "bg-ink text-bg" : "text-muted hover:text-ink")}
            >
              {l === "en" ? "English" : "हिंदी"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 min-h-[168px]" lang={lang}>
        {q.error && !e ? (
          <ErrorState error={q.error} onRetry={q.reload} />
        ) : !e ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-11/12" />
            <Skeleton className="h-5 w-10/12" />
            <Skeleton className="h-5 w-7/12" />
            <Skeleton className="mt-5 h-14" />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${e.lang}-${e.level}-${e.doctor.length}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="grid gap-5 lg:grid-cols-[1.4fr_1fr]"
            >
              <div>
                <div className="text-[12px] text-muted">{t.doctor}</div>
                <p className="mt-2 text-[16px] leading-relaxed text-ink">{e.doctor}</p>
              </div>
              <div className={cx("rounded-2xl p-4", LEVEL_STYLE[e.level].soft)}>
                <div className="text-[12px] text-muted">{t.patient}</div>
                <p className={cx("mt-2 text-[17px] leading-relaxed", LEVEL_STYLE[e.level].text)}>“{e.patient}”</p>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-faint">{e?.disclaimer ?? "AYU is decision support, not diagnosis. Final clinical judgment rests with the doctor."}</p>
    </div>
  );
}
