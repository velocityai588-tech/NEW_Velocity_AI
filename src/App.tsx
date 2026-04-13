import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/contexts/ToastContext";
import { ToastContainer } from "@/components/ToastContainer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AllocateTeamScreen } from "./components/planproject/AllocateTeamScreen";
// Page Imports
import Index from "./pages/Index";
import Demo from "./pages/Demo";
import VelocityAI from "./pages/VelocityAI";
import Projects from "./components/projects/Projects";
import ProjectAnalytics from "./components/projects/ProjectAnalytics";
import JiraDashboard from "./pages/JiraDashboard";
import GlobalGanttDashboard from "./pages/GlobalGanttDashboard";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import AuthCallback from "./pages/AuthCallback";
import NotFound from "./pages/NotFound";
import Dashboard from "./pages/Dashboard";
import People from "./pages/People";
import Plan from "./pages/Plan";
import Leave from "./pages/Leave";
import Settings from "./pages/Settings";
import OnboardingModeSelection from "./pages/onboarding/OnboardingModeSelection";
import OnboardingJoin from "./pages/onboarding/OnboardingJoin";
import OnboardingWelcome from "./pages/onboarding/OnboardingWelcome";
import OnboardingTeam from "./pages/onboarding/OnboardingTeam";
import OnboardingSettings from "./pages/onboarding/OnboardingSettings";
import OnboardingHolidays from "./pages/onboarding/OnboardingHolidays";
import OnboardingComplete from "./pages/onboarding/OnboardingComplete";
import { OnboardingProvider } from "@/contexts/OnboardingContext";
import InviteEmail from "./pages/InviteEmail";
import SetPassword from "./pages/SetPassword";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import CreateProject from "./components/projects/CreateProject";
import { EmployeeLayout } from "@/components/employee/EmployeeLayout";
import EmployeeDashboard from "./pages/employee/EmployeeDashboard";
import EmployeeProjects from "./pages/employee/EmployeeProjects";
import EmployeeProjectDetail from "./pages/employee/EmployeeProjectDetail";
import EmployeeProfile from "./pages/employee/EmployeeProfile";
import { EmployeeTimeScreen } from "./pages/employee/EmployeeTimeScreen";
import { VoiceProvider } from "@/contexts/VoiceContext";
import { VoiceAgent } from "@/components/voice/VoiceAgent";
import { GlobalVoiceCommander } from "@/components/voice/GlobalVoiceCommander";
import AgentDashboard from "./pages/AgentDashboard";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});


import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const ManagerRoute = ({ children }: { children: React.ReactNode }) => {
  const { orgRole, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && orgRole) {
      const role = orgRole.toLowerCase();
      if (role === 'employee' || role === 'member') {
        navigate('/app/employee/dashboard', { replace: true });
      }
    }
  }, [orgRole, loading]);

  if (loading) return null;
  return <>{children}</>;
};

const EmployeeRoute = ({ children }: { children: React.ReactNode }) => {
  const { orgRole, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && orgRole) {
      const role = orgRole.toLowerCase();
      if (role !== 'employee' && role !== 'member') {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [orgRole, loading]);

  if (loading) return null;
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ToastProvider>
      <TooltipProvider>
        <AuthProvider>
          <Analytics />
          <Toaster />
          <Sonner />
          <ToastContainer />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <VoiceProvider>
              <VoiceAgent />
              {/* Global voice overlay — Ctrl+Space from anywhere in the app */}
              <GlobalVoiceCommander />
              <OnboardingProvider>
              <Routes>
                {/* 1. Public Marketing Routes */}
                <Route path="/" element={<Index />} />
                <Route path="/demo" element={<Demo />} />

                {/* 2. Authentication Routes (Must stay outside ProtectedRoute) */}
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<SignUp />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/invite/email" element={<InviteEmail />} />
                <Route path="/invite/accept" element={<SetPassword />} />

                {/* 3. Onboarding Flow (Requires Auth, but no Org yet) */}
                <Route path="/onboarding/mode" element={<ProtectedRoute><OnboardingModeSelection /></ProtectedRoute>} />
                <Route path="/onboarding/join" element={<ProtectedRoute><OnboardingJoin /></ProtectedRoute>} />
                <Route path="/onboarding/welcome" element={<ProtectedRoute><OnboardingWelcome /></ProtectedRoute>} />
                <Route path="/onboarding/team" element={<ProtectedRoute><OnboardingTeam /></ProtectedRoute>} />
                <Route path="/onboarding/settings" element={<ProtectedRoute><OnboardingSettings /></ProtectedRoute>} />
                <Route path="/onboarding/holidays" element={<ProtectedRoute><OnboardingHolidays /></ProtectedRoute>} />
                <Route path="/onboarding/complete" element={<ProtectedRoute><OnboardingComplete /></ProtectedRoute>} />

                {/* 4. Employee/App Sub-routes */}
                <Route path="/app/employee" element={<ProtectedRoute><EmployeeRoute><EmployeeLayout /></EmployeeRoute></ProtectedRoute>}>
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<EmployeeDashboard />} />
                  <Route path="my-projects" element={<EmployeeProjects />} />
                  <Route path="projects/:id" element={<EmployeeProjectDetail />} />
                  <Route path="leave" element={<Navigate to="/app/employee/time?tab=leave" replace />} />
                  <Route path="time" element={<EmployeeTimeScreen />} />
                  <Route path="profile" element={<EmployeeProfile />} />
                </Route>

                {/* 5. Main Protected Dashboard Routes */}
                <Route path="/dashboard" element={<ProtectedRoute><ManagerRoute><Dashboard /></ManagerRoute></ProtectedRoute>} />
                <Route path="/velocity-ai" element={<ProtectedRoute><ManagerRoute><VelocityAI /></ManagerRoute></ProtectedRoute>} />
                <Route path="/agent" element={<ProtectedRoute><ManagerRoute><AgentDashboard /></ManagerRoute></ProtectedRoute>} />
                <Route path="/people" element={<ProtectedRoute><ManagerRoute><People /></ManagerRoute></ProtectedRoute>} />
                <Route path="/plan" element={<ProtectedRoute><ManagerRoute><Plan /></ManagerRoute></ProtectedRoute>} />
                <Route path="/allocate-team" element={<ProtectedRoute><ManagerRoute><AllocateTeamScreen /></ManagerRoute></ProtectedRoute>} />
                <Route path="/leave" element={<ProtectedRoute><ManagerRoute><Leave /></ManagerRoute></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><ManagerRoute><Settings /></ManagerRoute></ProtectedRoute>} />
                <Route path="/projects" element={<ProtectedRoute><ManagerRoute><Projects /></ManagerRoute></ProtectedRoute>} />
                <Route path="/projects/create" element={<ProtectedRoute><ManagerRoute><CreateProject /></ManagerRoute></ProtectedRoute>} />
                <Route path="/projects/global-gantt" element={<ProtectedRoute><ManagerRoute><GlobalGanttDashboard /></ManagerRoute></ProtectedRoute>} />
                <Route path="/projects/jira-dashboard" element={<ProtectedRoute><ManagerRoute><JiraDashboard /></ManagerRoute></ProtectedRoute>} />
                <Route path="/projects/:id" element={<ProtectedRoute><ManagerRoute><ProjectAnalytics /></ManagerRoute></ProtectedRoute>} />

                {/* 6. Fallback */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </OnboardingProvider>
          </VoiceProvider>
        </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </ToastProvider>
  </QueryClientProvider>
);

export default App;
