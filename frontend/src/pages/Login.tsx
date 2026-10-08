import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandMark } from "@/components/BrandMark";
import { PasswordInput } from "@/components/PasswordInput";
import { authenticateDemoUser, DEFAULT_DEMO_PASSWORD, DEMO_EMAIL } from "@/lib/demoAuth";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const login = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authenticateDemoUser(email, password)) {
      setError("Use the demo student email and password shown below.");
      return;
    }
    localStorage.setItem("prepmind-demo-session", "active");
    navigate("/");
  };

  const forgotPassword = () => {
    navigate("/forgot-password");
  };

  return <div className="flex min-h-svh items-center justify-center bg-slate-100 px-5 dark:bg-slate-950"><div className="w-full max-w-md"><div className="mb-8 flex justify-center"><BrandMark /></div><div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"><div className="mb-7"><p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600">Welcome back</p><h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight" data-testid="login-heading">Continue your preparation.</h1><p className="mt-2 text-sm text-slate-500">Your next clear explanation is one question away.</p></div><form onSubmit={login} className="space-y-4" data-testid="login-form"><label className="block text-sm font-semibold">Email<Input type="email" className="mt-2" placeholder="you@example.com" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} autoComplete="email" data-testid="login-email-input" /></label><label className="block text-sm font-semibold">Password<span className="flex items-center justify-between"><span className="sr-only">Password</span><button type="button" onClick={forgotPassword} className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400" data-testid="login-forgot-password-button">Forgot password?</button></span><PasswordInput placeholder="••••••••" value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} autoComplete="current-password" data-testid="login-password-input" toggleTestId="login-password-toggle" /></label>{error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300" role="alert" data-testid="login-error-message">{error}</p>}<Button type="submit" className="h-11 w-full gap-2 bg-indigo-600 hover:bg-indigo-700" data-testid="login-submit-button">Login <ArrowRight size={16} /></Button><Button type="button" variant="outline" className="h-11 w-full gap-2" data-testid="login-google-button"><Sparkles size={16} /> Continue with Google</Button></form><div className="mt-5 rounded-xl bg-indigo-50 px-3 py-3 text-xs leading-5 text-indigo-800 dark:bg-indigo-500/10 dark:text-indigo-200" data-testid="demo-login-credentials"><p className="font-semibold">Default demo student access</p><p>Email: {DEMO_EMAIL}</p><p>Password: {DEFAULT_DEMO_PASSWORD}</p></div><p className="mt-6 text-center text-sm text-slate-500">Don't have an account? <Link to="/signup" className="font-semibold text-indigo-600 hover:underline" data-testid="login-signup-link">Create one</Link></p></div></div></div>;
}