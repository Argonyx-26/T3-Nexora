import { AnimatePresence, motion } from "framer-motion";
import { QrCode, Smartphone, X } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { cx } from "./ui";

/*
 * "Scan to join AYU": a QR code for the self-registration page, so anyone in the room can add
 * themselves from their phone and appear on the ward live. Works whenever AYU is on an address
 * phones can reach (a deployed link, or the laptop's address on the same Wi-Fi).
 */

export function InviteQR({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState<string>();
  const url = `${window.location.origin}/register`;
  const local = /^(localhost|127\.|\[::1\])/.test(window.location.hostname);
  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(url, { margin: 1, width: 560, color: { dark: "#05070a", light: "#ffffff" } }).then(setSrc).catch(() => setSrc(undefined));
  }, [open, url]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx("inline-flex h-8 items-center gap-1.5 rounded-full border border-line-2 px-3.5 text-[12px] font-medium hover:border-teal", className)}>
        <QrCode size={14} aria-hidden />Invite a patient
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
            <motion.div initial={{ scale: 0.94, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96 }} onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-[28px] border border-line-2 bg-surface p-7 text-center shadow-2xl" role="dialog" aria-label="Scan to join AYU">
              <button type="button" onClick={() => setOpen(false)} className="float-right grid size-8 place-items-center rounded-full text-muted hover:text-ink" aria-label="Close"><X size={16} /></button>
              <div className="eyebrow flex items-center justify-center gap-2"><Smartphone size={13} aria-hidden />Scan to join AYU</div>
              <div className="mt-2 font-display text-[30px] leading-tight">Add yourself — <span className="accent text-teal">live.</span></div>
              <p className="mt-2 text-[14px] text-muted">Register on your phone in English or हिंदी. You'll appear on this ward with a doctor assigned, in seconds.</p>
              <div className="mx-auto mt-5 w-64 rounded-2xl bg-white p-3">
                {src ? <img src={src} alt={`QR code for ${url}`} className="w-full" /> : <div className="aspect-square animate-pulse rounded-xl bg-surface-2" />}
              </div>
              <div className="mt-3 font-mono text-[12px] break-all text-ink-2">{url}</div>
              {local && (
                <p className="mt-3 rounded-xl bg-watch-soft px-3 py-2 text-[12px] text-watch">
                  This is a localhost address — phones can't reach it. Open AYU from its public link (or the laptop's Wi-Fi address) and the QR will follow.
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
