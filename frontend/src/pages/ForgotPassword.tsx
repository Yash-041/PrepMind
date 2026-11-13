import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, Mail, Send } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState((location.state as { email?: string } | null)?.email ?? "");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const sendResetLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSending(true);
    const normalized = email.trim().toLowerCase();
    try {
      await api.forgotPassword(normalized);
      navigate(`/forgot-password-sent?email=${encodeURIComponent(normalized)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to connect to the server. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return <div className="flex min-h-svh items-center justify-center bg-slate-100 px-5 dark:bg-slate-950"><div className="w-full max-w-md"><div className="mb-8 flex justify-center"><BrandMark /></div><div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"><div className="flex size-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"><Mail size={22} /></div><p className="mt-6 text-xs font-bold uppercase tracking-[.18em] text-indigo-600 dark:text-indigo-400" data-testid="forgot-password-kicker">Account recovery</p><h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight" data-testid="forgot-password-heading">Forgot your password?</h1><p className="mt-3 text-sm leading-6 text-slate-500" data-testid="forgot-password-description">Enter the email you signed up with and we’ll send you a link to choose a new password.</p><form onSubmit={sendResetLink} className="mt-6 space-y-4" data-testid="forgot-password-form"><label className="block text-sm font-semibold">Email<Input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} className="mt-2" placeholder="you@gmail.com" autoComplete="email" required data-testid="forgot-password-email-input" /></label>{error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300" role="alert" data-testid="forgot-password-error">{error}</p>}<Button type="submit" disabled={sending} className="h-11 w-full gap-2 bg-indigo-600 hover:bg-indigo-700" data-testid="forgot-password-send-button"><Send size={16} /> {sending ? "Sending…" : "Send reset link"}</Button></form><Link to="/login" className="mt-5 flex items-center justify-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-600" data-testid="forgot-password-back-link"><ArrowLeft size={15} /> Back to login</Link></div></div></div>;
}
