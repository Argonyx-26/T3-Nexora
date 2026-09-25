import { motion } from "framer-motion";
import { MapPinOff } from "lucide-react";
import { Shell } from "../components/Shell";
import { Arrow, Button } from "../components/ui";

export default function NotFound() {
  return (
    <Shell>
      <div className="mx-auto max-w-xl px-4 py-32 text-center">
        <motion.span
          aria-hidden
          className="mx-auto mb-6 grid size-20 place-items-center rounded-full bg-surface-2 text-muted"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          <MapPinOff size={34} strokeWidth={1.4} />
        </motion.span>
        <div className="eyebrow">404</div>
        <h1 className="mt-4 font-display text-[64px] leading-none">Nothing here.</h1>
        <p className="mt-4 text-[15px] text-muted">This page doesn't exist. The ward is one click away.</p>
        <div className="mt-8"><Button to="/doctor">Open the ward <Arrow /></Button></div>
      </div>
    </Shell>
  );
}
