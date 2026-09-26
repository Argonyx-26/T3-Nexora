import { Square, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cx } from "./ui";

/*
 * Read text aloud in English or Hindi with the browser's own speech (works offline on most
 * phones and laptops) — for patients and families who find reading hard.
 */

function voiceFor(lang: "en" | "hi"): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const want = lang === "hi" ? ["hi-IN", "hi"] : ["en-IN", "en-GB", "en-US", "en"];
  for (const w of want) {
    const v = voices.find((x) => x.lang.toLowerCase().startsWith(w.toLowerCase()));
    if (v) return v;
  }
  return undefined;
}

export function Speak({ text, lang, className, label }: { text: string; lang: "en" | "hi"; className?: string; label?: string }) {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => { if (supported) window.speechSynthesis.cancel(); }, [supported]);
  if (!supported) return null;
  const toggle = () => {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "hi" ? "hi-IN" : "en-IN";
    const v = voiceFor(lang);
    if (v) u.voice = v;
    u.rate = lang === "hi" ? 0.92 : 0.98;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(u);
  };
  return (
    <button type="button" onClick={toggle} aria-pressed={speaking}
      className={cx("inline-flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-medium transition-colors",
        speaking ? "bg-teal text-bg" : "bg-surface text-ink hover:bg-teal-soft", className)}>
      {speaking ? <Square size={14} aria-hidden /> : <Volume2 size={16} aria-hidden />}
      {label ?? (lang === "hi" ? (speaking ? "रोकें" : "सुनें") : speaking ? "Stop" : "Listen")}
    </button>
  );
}
