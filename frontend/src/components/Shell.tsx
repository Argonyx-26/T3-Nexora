import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { DISCLAIMER } from "../lib/format";
import { useTheme } from "../lib/theme";
import { ErrorBoundary } from "./ErrorBoundary";
import { cx } from "./ui";

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link to="/" className={cx("group inline-flex items-baseline gap-1.5", className)} aria-label="AYU home">
      <span className="font-display text-[26px] leading-none tracking-tight">AYU</span>
      <span className="size-1.5 rounded-full bg-teal transition-transform duration-300 group-hover:scale-150" />
    </Link>
  );
}

export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      className="h-8 rounded-full border border-line px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted transition-colors hover:border-line-2 hover:text-ink"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}

const NAV = [
  { to: "/doctor", label: "Ward" },
  { to: "/patient", label: "Patient view" },
];

export function Shell({ children, status }: { children: ReactNode; status?: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] overflow-hidden">
        <div className="bg-grid absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_20%_0%,black,transparent_70%)]" />
        <div className="absolute -top-64 left-[15%] h-[560px] w-[900px] rounded-full bg-[radial-gradient(closest-side,var(--glow),transparent)] opacity-40 blur-3xl" />
      </div>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:gap-6 sm:px-8">
          <Wordmark />
          <nav className="flex min-w-0 items-center gap-0.5 sm:gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  cx("relative whitespace-nowrap rounded-full px-2.5 py-1.5 text-[13px] transition-colors sm:px-3 sm:text-[14px]", isActive ? "text-ink" : "text-muted hover:text-ink")
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-surface-2" transition={{ type: "spring", stiffness: 400, damping: 34 }} />
                    )}
                    <span className="relative">{n.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {status}
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="flex-1">
        <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-2 px-4 py-6 text-[12px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>
          <span className="font-medium text-ink-2">{DISCLAIMER}</span>
        </p>
        <p className="font-mono tracking-wide">Team AYU · Argonyx'26</p>
      </div>
    </footer>
  );
}

/** "Synced 14:05" with a breathing dot; turns amber when the server can't be reached. */
export function SyncStatus({ at, error }: { at?: Date; error?: Error }) {
  const ok = !error;
  return (
    <div className="hidden items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted sm:flex" role="status">
      <span className={cx("size-1.5 rounded-full", ok ? "live-dot bg-stable" : "bg-watch")} />
      {ok ? (at ? `Synced ${at.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}` : "Connecting") : "Reconnecting"}
    </div>
  );
}
