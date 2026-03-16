import { AnimatePresence, motion } from "framer-motion";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { BrowserRouter } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import { SpinnerPage } from "@/components/shared/SpinnerPage";
import { useAuth } from "@/hooks/useAuth";
import { AgentTimelinePage } from "@/pages/AgentTimelinePage";
import { AgentsPage } from "@/pages/AgentsPage";
import { AlertsPage } from "@/pages/AlertsPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { LlmConfigPage } from "@/pages/LlmConfigPage";
import { LoginPage } from "@/pages/LoginPage";
import { RulesPage } from "@/pages/RulesPage";
import { SchedulerConfigPage } from "@/pages/SchedulerConfigPage";

function ProtectedRoutes() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return <SpinnerPage message="Loading security workspace..." />;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AppShell>
      <AnimatedOutlet />
    </AppShell>
  );
}

function AnimatedOutlet() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.18 }}
        className="h-full"
      >
        <Outlet />
      </motion.div>
    </AnimatePresence>
  );
}

function AppRoutes() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <SpinnerPage message="Initializing..." />;
  }

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route element={<ProtectedRoutes />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/agents/:agentId" element={<AgentTimelinePage />} />
        <Route path="/llm-config" element={<LlmConfigPage />} />
        <Route path="/scheduler" element={<SchedulerConfigPage />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/enrollment-tokens" element={<Navigate to="/agents" replace />} />
      </Route>
      <Route path="*" element={<Navigate to={isAuthenticated ? "/" : "/login"} replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
