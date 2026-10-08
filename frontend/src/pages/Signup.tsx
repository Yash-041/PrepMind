import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandMark } from "@/components/BrandMark";
import { PasswordInput } from "@/components/PasswordInput";
import { saveDemoAccount } from "@/lib/demoAuth";
import type { DemoProfile } from "@/lib/demoAuth";

export default function Signup() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [targetExam, setTargetExam] = useState<DemoProfile["targetExam"]>("JEE Main");
  const [currentClass, setCurrentClass] = useState<DemoProfile["currentClass"]>("Class 11");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const createAccount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }
    if (password.length < 8) {
      setError("Your password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    saveDemoAccount({ name: name.trim(), targetExam, currentClass }, email, password);
    localStorage.setItem("prepmind-demo-session", "active");
    navigate("/");
  };

  const clearError = () => setError("");

  return <div className="flex min-h-svh items-center justify-center bg-slate-100 px-5 py-8 dark:bg-slate-950"><div className="w-full max-w-md"><div className="mb-7 flex justify-center"><BrandMark /></div><div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"><div className="mb-7"><p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600">Start focused</p><h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight" data-testid="signup-heading">Create your study space.</h1><p className="mt-2 text-sm text-slate-500">Set up your demo PrepMind account and study preferences.</p></div><form onSubmit={createAccount} className="space-y-4" data-testid="signup-form"><label className="block text-sm font-semibold">Full name<Input value={name} onChange={(event) => { setName(event.target.value); clearError(); }} className="mt-2" placeholder="Aarav Kumar" autoComplete="name" data-testid="signup-name-input" /></label><label className="block text-sm font-semibold">Email<Input type="email" value={email} onChange={(event) => { setEmail(event.target.value); clearError(); }} className="mt-2" placeholder="you@gmail.com" autoComplete="email" data-testid="signup-email-input" /></label><div className="grid grid-cols-2 gap-3"><label className="block text-sm font-semibold">Target exam<select value={targetExam} onChange={(event) => setTargetExam(event.target.value as DemoProfile["targetExam"])} className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950" data-testid="signup-target-select"><option value="JEE Main">JEE Main</option><option value="JEE Advanced">JEE Advanced</option></select></label><label className="block text-sm font-semibold">Class<select value={currentClass} onChange={(event) => setCurrentClass(event.target.value as DemoProfile["currentClass"])} className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950" data-testid="signup-class-select"><option value="Class 11">Class 11</option><option value="Class 12">Class 12</option><option value="Class 12 pass-out">Class 12 pass-out</option></select></label></div><div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-semibold">Password<PasswordInput value={password} onChange={(event) => { setPassword(event.target.value); clearError(); }} placeholder="At least 8 characters" autoComplete="new-password" data-testid="signup-password-input" toggleTestId="signup-password-toggle" /></label><label className="block text-sm font-semibold">Confirm password<PasswordInput value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); clearError(); }} placeholder="Repeat password" autoComplete="new-password" data-testid="signup-confirm-password-input" toggleTestId="signup-confirm-password-toggle" /></label></div>{error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300" role="alert" data-testid="signup-error-message">{error}</p>}<Button type="submit" className="h-11 w-full gap-2 bg-indigo-600 hover:bg-indigo-700" data-testid="signup-submit-button">Create account <ArrowRight size={16} /></Button></form><p className="mt-6 text-center text-sm text-slate-500">Already have an account? <Link to="/login" className="font-semibold text-indigo-600 hover:underline" data-testid="signup-login-link">Login</Link></p></div></div></div>;
}