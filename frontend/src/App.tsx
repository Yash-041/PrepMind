import { Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import Daily20 from "@/pages/Daily20";
import ExamSimulator from "@/pages/ExamSimulator";
import Progress from "@/pages/Progress";
import Profile from "@/pages/Profile";
import Settings from "@/pages/Settings";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import ForgotPasswordSent from "@/pages/ForgotPasswordSent";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import { AppShell } from "@/components/AppShell";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppShell><Home /></AppShell>} />
      <Route path="/daily" element={<AppShell><Daily20 /></AppShell>} />
      <Route path="/exam" element={<AppShell><ExamSimulator /></AppShell>} />
      <Route path="/progress" element={<AppShell><Progress /></AppShell>} />
      <Route path="/profile" element={<AppShell><Profile /></AppShell>} />
      <Route path="/settings" element={<AppShell><Settings /></AppShell>} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password-sent" element={<ForgotPasswordSent />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
    </Routes>
  );
}
