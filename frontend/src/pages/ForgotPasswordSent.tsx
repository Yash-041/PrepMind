import { useEffect, useState } from "react";
import { ArrowLeft, MailCheck, RefreshCw } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";

const COOLDOWN_SECONDS = 60;

export default function ForgotPasswordSent() {
  const [params] = useSearchParams();
  const email = params.get("email") ?? "";
  const [cooldown, setCooldown] = useState(COOLDOWN_SECONDS);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const resend = async () => {
    setSending(true);
    setStatus(null);
    try {
      await api.forgotPassword(email);
      setStatus({ tone: "ok", text: "A new reset link is on its way." });
      setCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      setStatus({ tone: "error", text: err instanceof ApiError ? err.message : "Couldn't reach the server. Try again." });
    } finally {
      setSending(false);
    }
  };

  return <div className="flex min-h-svh items-center justify-center bg-slate-100 px-5 dark:bg-slate-950"><div className="w-full max-w-md"><div className="mb-8 flex justify-center"><BrandMark /></div><div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"><div className="flex size-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"><MailCheck size={22} /></div><p className="mt-6 text-xs font-bold uppercase tracking-[.18em] text-indigo-600 dark:text-indigo-400" data-testid="reset-email-kicker">Check your email</p><h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight" data-testid="reset-email-heading">Reset link sent.</h1><p className="mt-3 text-sm leading-6 text-slate-500" data-testid="reset-email-description">If an account exists for {email ? <strong className="text-slate-800 dark:text-slate-200">{email}</strong> : "that email"}, we’ve sent a link to reset your password. It expires in 30 minutes and works once.</p><p className="mt-3 text-xs leading-5 text-slate-400">Can't find it? Check your spam or promotions folder.</p><div className="mt-6"><Button type="button" variant="outline" className="h-11 w-full gap-2" disabled={sending || cooldown > 0 || !email} onClick={resend} data-testid="reset-email-resend-button"><RefreshCw size={15} className={sending ? "animate-spin" : ""} />{cooldown > 0 ? `Resend link in ${cooldown}s` : "Resend reset link"}</Button>{status && <p className={`mt-2 text-center text-xs ${status.tone === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`} role="status" data-testid="reset-email-resend-status">{status.text}</p>}</div><Link to="/login" state={{ email }} className="mt-5 flex items-center justify-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-600" data-testid="reset-email-back-link"><ArrowLeft size={15} /> Back to login</Link></div></div></div>;
}
