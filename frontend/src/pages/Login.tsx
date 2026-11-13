import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandMark } from "@/components/BrandMark";
import { PasswordInput } from "@/components/PasswordInput";
import { ResendVerification } from "@/components/ResendVerification";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { api, ApiError } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

type LoginLocationState = { email?: string; message?: string; from?: string } | null;

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LoginLocationState;
  const [email, setEmail] = useState(state?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [unverifiedEmail, setUnverifiedEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setUnverifiedEmail("");
    setIsSubmitting(true);
    try {
      await api.login({ email: email.trim().toLowerCase(), password });
      queryClient.clear();
      navigate(state?.from ?? "/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "email_not_verified") {
        setUnverifiedEmail(email.trim().toLowerCase());
        setError("Your email isn't verified yet. Click the link we emailed you, or request a new one below.");
      } else {
        setError(err instanceof ApiError ? err.message : "Unable to connect to the server. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const clearError = () => { setError(""); setUnverifiedEmail(""); };

  return <div className="flex min-h-svh items-center justify-center bg-slate-100 px-5 dark:bg-slate-950"><div className="w-full max-w-md"><div className="mb-8 flex justify-center"><BrandMark /></div><div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"><div className="mb-7"><p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600">Welcome back</p><h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight" data-testid="login-heading">Continue your preparation.</h1><p className="mt-2 text-sm text-slate-500">Your next clear explanation is one question away.</p></div>{state?.message && !error && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300" role="status" data-testid="login-info-message">{state.message}</p>}<form onSubmit={login} className="space-y-4" data-testid="login-form"><label className="block text-sm font-semibold">Email<Input type="email" required className="mt-2" placeholder="you@example.com" value={email} onChange={(event) => { setEmail(event.target.value); clearError(); }} autoComplete="email" data-testid="login-email-input" /></label><label className="block text-sm font-semibold">Password<span className="flex items-center justify-between"><span className="sr-only">Password</span><button type="button" onClick={() => navigate("/forgot-password", { state: { email: email.trim().toLowerCase() } })} className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400" data-testid="login-forgot-password-button">Forgot password?</button></span><PasswordInput required placeholder="••••••••" value={password} onChange={(event) => { setPassword(event.target.value); clearError(); }} autoComplete="current-password" data-testid="login-password-input" toggleTestId="login-password-toggle" /></label>{error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300" role="alert" data-testid="login-error-message">{error}</p>}{unverifiedEmail && <ResendVerification email={unverifiedEmail} />}<Button type="submit" disabled={isSubmitting} className="h-11 w-full gap-2 bg-indigo-600 hover:bg-indigo-700" data-testid="login-submit-button">{isSubmitting ? "Logging in…" : "Login"} <ArrowRight size={16} /></Button></form><GoogleSignInButton text="signin_with" redirectTo={state?.from ?? "/"} /><p className="mt-6 text-center text-sm text-slate-500">Don't have an account? <Link to="/signup" className="font-semibold text-indigo-600 hover:underline" data-testid="login-signup-link">Create one</Link></p></div></div></div>;
}
