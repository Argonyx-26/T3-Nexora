import { motion } from "framer-motion";
import { CloudOff, Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LEVEL_STYLE } from "../lib/format";
import type { Level } from "../lib/types";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-2xl border border-line bg-surface", className)}>{children}</div>;
}

export function Eyebrow({ children, className, icon: Icon }: { children: ReactNode; className?: string; icon?: LucideIcon }) {
  if (!Icon) return <div className={cx("eyebrow", className)}>{children}</div>;
  return (
    <div className={cx("eyebrow flex items-center gap-2", className)}>
      <Icon size={13} strokeWidth={1.75} aria-hidden className="shrink-0" />
      {children}
    </div>
  );
}

type ButtonProps = { children: ReactNode; variant?: "primary" | "ghost" | "quiet"; className?: string } & (
  | { to: string; onClick?: never; type?: never }
  | { to?: never; onClick?: () => void; type?: "button" | "submit" }
);

export function Button({ children, variant = "primary", className, ...rest }: ButtonProps) {
  const cls = cx(
    "group inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 h-11 text-[14px] font-medium transition-all duration-200 active:scale-[0.98]",
    variant === "primary" && "bg-ink text-bg hover:bg-teal hover:shadow-[0_0_48px_-6px_var(--glow)]",
    variant === "ghost" && "border border-line-2 bg-bg/70 text-ink backdrop-blur-md hover:border-ink",
    variant === "quiet" && "text-muted hover:text-ink px-3",
    className,
  );
  if (rest.to) return <Link to={rest.to} className={cls}>{children}</Link>;
  return <button type={rest.type ?? "button"} onClick={rest.onClick} className={cls}>{children}</button>;
}

/** A typographic arrow that slides on hover of the parent `group`. */
export function Arrow() {
  return <span aria-hidden className="inline-block transition-transform duration-300 group-hover:translate-x-1">→</span>;
}

export function LevelDot({ level, className }: { level: Level; className?: string }) {
  return <span aria-hidden className={cx("inline-block size-2 rounded-full", LEVEL_STYLE[level].dot, level === "Critical" && "pulse-critical", className)} />;
}

export function RiskBadge({ level, score, size = "md" }: { level: Level; score?: number; size?: "sm" | "md" }) {
  const s = LEVEL_STYLE[level];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-full font-medium",
        s.soft, s.text,
        size === "sm" ? "h-6 px-2.5 text-[12px]" : "h-7 px-3 text-[13px]",
      )}
    >
      <LevelDot level={level} />
      {level}
      {score !== undefined && <span className="font-mono tnum opacity-80">{score}</span>}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-xl bg-surface-2", className)} />;
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <Card className="p-8 text-center">
      <CloudOff size={28} strokeWidth={1.5} aria-hidden className="mx-auto mb-3 text-muted" />
      <div className="font-display text-3xl">Couldn't load this</div>
      <p className="mx-auto mt-2 max-w-md text-[14px] text-muted">{error.message}</p>
      {onRetry && (
        <div className="mt-5">
          <Button variant="ghost" onClick={onRetry}>Try again</Button>
        </div>
      )}
    </Card>
  );
}

export function EmptyState({ title, children, icon: Icon = Inbox }: { title: string; children?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-2 px-6 py-10 text-center">
      <span className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-surface-2 text-muted">
        <Icon size={20} strokeWidth={1.6} aria-hidden />
      </span>
      <div className="font-display text-2xl text-ink-2">{title}</div>
      {children && <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-muted">{children}</p>}
    </div>
  );
}

/** Fade-and-rise on first view. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
