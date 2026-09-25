import { motion } from "framer-motion";
import { ChartLine, LayoutDashboard, Moon, Sun, UserRound, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { DISCLAIMER } from "../lib/format";
import { useTheme } from "../lib/theme";
import { ErrorBoundary } from "./ErrorBoundary";
import { Logo } from "./Logo";
import { cx } from "./ui";

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link to="/" className={cx("group inline-flex shrink-0 items-center", className)} aria-label="AYU home">
      <Logo size={26} />
    </Link>
  );
}

export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      className="group inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted transition-colors hover:border-line-2 hover:text-ink sm:px-3 sm:text-[11px] sm:tracking-[0.12em]"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? (
        <Sun size={13} strokeWidth={1.75} aria-hidden className="transition-transform duration-500 group-hover:rotate-90" />
      ) : (
        <Moon size={13} strokeWidth={1.75} aria-hidden className="transition-transform duration-500 group-hover:-rotate-12" />
      )}
      <span className="hidden sm:inline">{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}

const NAV: { to: string; label: string; short: string; icon: LucideIcon; tiny?: string }[] = [
  { to: "/doctor", label: "Ward", short: "Ward", icon: LayoutDashboard },
  { to: "/evaluation", label: "Evaluation", short: "Proof", icon: ChartLine },
  { to: "/patient", label: "Patient view", short: "Patient", icon: UserRound, tiny: "max-[359px]:hidden" }, // no room on 320 px phones
];

export function Shell({ children, status }: { children: ReactNode; status?: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="aurora relative isolate flex min-h-dvh flex-col">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] overflow-hidden">
        <div className="bg-grid absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_20%_0%,black,transparent_70%)]" />
        <div className="absolute -top-64 left-[15%] h-[560px] w-[900px] rounded-full bg-[radial-gradient(closest-side,var(--glow),transparent)] opacity-40 blur-3xl" />
      </div>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-2 px-4 sm:gap-6 sm:px-8">
          <Wordmark />
          <nav className="flex min-w-0 items-center gap-0.5 sm:gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  cx("relative whitespace-nowrap rounded-full px-2 py-1.5 text-[13px] transition-colors sm:px-3 sm:text-[14px]", n.tiny, isActive ? "text-ink" : "text-muted hover:text-ink")
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-surface-2" transition={{ type: "spring", stiffness: 400, damping: 34 }} />
                    )}
                    <span className="relative inline-flex items-center gap-1.5">
                      <n.icon size={14} strokeWidth={1.75} aria-hidden className="hidden sm:block" />
                      <span className="sm:hidden">{n.short}</span>
                      <span className="hidden sm:inline">{n.label}</span>
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
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
