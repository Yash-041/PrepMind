import type { ReactNode } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Home from "@/pages/Home";
import Daily20 from "@/pages/Daily20";
import ExamSimulator from "@/pages/ExamSimulator";
import Progress from "@/pages/Progress";
import Profile from "@/pages/Profile";
import Settings from "@/pages/Settings";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import CheckEmail from "@/pages/CheckEmail";
import VerifyEmail from "@/pages/VerifyEmail";
import ForgotPasswordSent from "@/pages/ForgotPasswordSent";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import { AppShell } from "@/components/AppShell";
import { getAccessToken } from "@/lib/session";

// App pages need a logged-in (and therefore email-verified) user.
function Protected({ children }: { children: ReactNode }) {
  const location = useLocation();
  if (!getAccessToken()) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <AppShell>{children}</AppShell>;
}

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Protected><Home /></Protected>} />
      <Route path="/daily" element={<Protected><Daily20 /></Protected>} />
      <Route path="/exam" element={<Protected><ExamSimulator /></Protected>} />
      <Route path="/progress" element={<Protected><Progress /></Protected>} />
      <Route path="/profile" element={<Protected><Profile /></Protected>} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/check-email" element={<CheckEmail />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/forgot-password-sent" element={<ForgotPasswordSent />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
    </Routes>
  );
}
