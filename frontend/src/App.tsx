import { MotionConfig, motion } from "framer-motion";
import type { ReactNode } from "react";
import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Landing from "./pages/Landing";

// The landing page ships in the first bundle; every other screen loads on demand.
const Doctor = lazy(() => import("./pages/Doctor"));
const PatientDetail = lazy(() => import("./pages/PatientDetail"));
const Demo = lazy(() => import("./pages/Demo"));
const Evaluation = lazy(() => import("./pages/Evaluation"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PatientPicker = lazy(() => import("./pages/PatientPortal").then((m) => ({ default: m.PatientPicker })));
const PatientHome = lazy(() => import("./pages/PatientPortal").then((m) => ({ default: m.PatientHome })));

function ScreenLoading() {
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-label="Loading">
      <span className="live-dot size-2 rounded-full bg-teal" />
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** Every screen fades in on arrival. Opacity only: a transform here would re-anchor fixed headers and toasts. */
function PageFade({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <motion.div key={pathname} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <ErrorBoundary>
          <ScrollToTop />
          <Suspense fallback={<ScreenLoading />}>
          <PageFade>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/doctor" element={<Doctor />} />
            <Route path="/demo" element={<Demo />} />
            <Route path="/evaluation" element={<Evaluation />} />
            <Route path="/patients/:id" element={<PatientDetail />} />
            <Route path="/patient" element={<PatientPicker />} />
            <Route path="/patient/:id" element={<PatientHome />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </PageFade>
          </Suspense>
        </ErrorBoundary>
      </BrowserRouter>
    </MotionConfig>
  );
}
