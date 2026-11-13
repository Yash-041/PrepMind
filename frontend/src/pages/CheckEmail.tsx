import { ArrowLeft, MailCheck } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { BrandMark } from "@/components/BrandMark";
import { ResendVerification } from "@/components/ResendVerification";

export default function CheckEmail() {
  const [params] = useSearchParams();
  const email = params.get("email") ?? "";

  return <div className="flex min-h-svh items-center justify-center bg-slate-100 px-5 dark:bg-slate-950"><div className="w-full max-w-md"><div className="mb-8 flex justify-center"><BrandMark /></div><div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"><div className="flex size-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"><MailCheck size={22} /></div><p className="mt-6 text-xs font-bold uppercase tracking-[.18em] text-indigo-600 dark:text-indigo-400" data-testid="check-email-kicker">One last step</p><h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight" data-testid="check-email-heading">Verify your email.</h1><p className="mt-3 text-sm leading-6 text-slate-500" data-testid="check-email-description">We sent a verification link to {email ? <strong className="text-slate-800 dark:text-slate-200">{email}</strong> : "your email address"}. Click it to activate your account, then log in. The link expires in 24 hours.</p><p className="mt-3 text-xs leading-5 text-slate-400">Can't find it? Check your spam or promotions folder.</p><div className="mt-6"><ResendVerification email={email} startCoolingDown /></div><Link to="/login" state={{ email }} className="mt-5 flex items-center justify-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-600" data-testid="check-email-login-link"><ArrowLeft size={15} /> Back to login</Link></div></div></div>;
}
