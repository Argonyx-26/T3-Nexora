import { MotionConfig } from "framer-motion";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Demo from "./pages/Demo";
import Doctor from "./pages/Doctor";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";
import PatientDetail from "./pages/PatientDetail";
import { PatientHome, PatientPicker } from "./pages/PatientPortal";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <ErrorBoundary>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/doctor" element={<Doctor />} />
            <Route path="/demo" element={<Demo />} />
            <Route path="/patients/:id" element={<PatientDetail />} />
            <Route path="/patient" element={<PatientPicker />} />
            <Route path="/patient/:id" element={<PatientHome />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ErrorBoundary>
      </BrowserRouter>
    </MotionConfig>
  );
}
