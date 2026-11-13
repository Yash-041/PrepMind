import { useEffect, useRef, useState } from "react";
import { ArrowRight, CircleCheck, CircleX, LoaderCircle } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { BrandMark } from "@/components/BrandMark";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResendVerification } from "@/components/ResendVerification";
import { api, ApiError } from "@/lib/api";

type State = { status: "verifying" } | { status: "verified"; email: string } | { status: "failed"; message: string };

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>(token ? { status: "verifying" } : { status: "failed", message: "This verification link is incomplete." });
  const [resendEmail, setResendEmail] = useState("");
  const started = useRef(false);

  useEffect(() => {
    // StrictMode runs effects twice in development; verify only once.
    if (!token || started.current) return;
    started.current = true;
    api.verifyEmail(token)
      .then((user) => setState({ status: "verified", email: user.email }))
      .catch((err) => setState({ status: "failed", message: err instanceof ApiError ? err.message : "Couldn't reach the server. Refresh to try again." }));
  }, [token]);

  return <div className="flex min-h-svh items-center justify-center bg-slate-100 px-5 dark:bg-slate-950"><div className="w-full max-w-md"><div className="mb-8 flex justify-center"><BrandMark /></div><div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none" data-testid="verify-email-card">
    {state.status === "verifying" && <div className="flex flex-col items-center py-6 text-center"><LoaderCircle size={28} className="animate-spin text-indigo-600" /><p className="mt-4 text-sm text-slate-500" data-testid="verify-email-loading">Verifying your email…</p></div>}
    {state.status === "verified" && <><div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"><CircleCheck size={22} /></div><p className="mt-6 text-xs font-bold uppercase tracking-[.18em] text-emerald-600 dark:text-emerald-400">Account activated</p><h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight" data-testid="verify-email-success-heading">Email verified.</h1><p className="mt-3 text-sm leading-6 text-slate-500"><strong className="text-slate-800 dark:text-slate-200">{state.email}</strong> is confirmed. Log in to start learning with your AI tutor.</p><Link to="/login" state={{ email: state.email, message: "Email verified. You can log in now." }} className={`${buttonVariants()} mt-6 h-11 w-full gap-2 bg-indigo-600 hover:bg-indigo-700`} data-testid="verify-email-login-button">Continue to login <ArrowRight size={16} /></Link></>}
    {state.status === "failed" && <><div className="flex size-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"><CircleX size={22} /></div><p className="mt-6 text-xs font-bold uppercase tracking-[.18em] text-rose-600 dark:text-rose-400">Verification failed</p><h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight" data-testid="verify-email-failed-heading">Link not valid.</h1><p className="mt-3 text-sm leading-6 text-slate-500" data-testid="verify-email-error">{state.message}</p><label className="mt-6 block text-sm font-semibold">Your email<Input type="email" className="mt-2" placeholder="you@example.com" value={resendEmail} onChange={(event) => setResendEmail(event.target.value.trim())} data-testid="verify-email-resend-input" /></label><div className="mt-3"><ResendVerification email={resendEmail} /></div><Link to="/login" className="mt-5 block text-center text-sm font-semibold text-slate-500 hover:text-indigo-600">Back to login</Link></>}
  </div></div></div>;
}
