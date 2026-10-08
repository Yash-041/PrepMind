import { useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, KeyRound, ShieldX } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { BrandMark } from "@/components/BrandMark";
import { Button, buttonVariants } from "@/components/ui/button";
import { PasswordInput } from "@/components/PasswordInput";
import { completeDemoPasswordReset, isValidDemoResetToken } from "@/lib/demoAuth";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [valid] = useState(() => isValidDemoResetToken(token));
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < 8) {
      setError("Your new password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    if (!token || !completeDemoPasswordReset(token, password)) {
      setError("This reset link is invalid or has expired.");
      return;
    }
    setComplete(true);
  };

  if (!valid) return <div className="flex min-h-svh items-center justify-center bg-slate-100 px-5 dark:bg-slate-950"><div className="w-full max-w-md"><div className="mb-8 flex justify-center"><BrandMark /></div><div className="rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-xl shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"><ShieldX size={35} className="mx-auto text-rose-500" /><h1 className="mt-5 font-heading text-2xl font-semibold tracking-tight" data-testid="invalid-reset-heading">Reset link required</h1><p className="mt-2 text-sm leading-6 text-slate-500" data-testid="invalid-reset-description">This page only opens from a valid password reset link. Request a new link from Login.</p><Link to="/login" className={`${buttonVariants()} mt-6 w-full bg-indigo-600 hover:bg-indigo-700`} data-testid="invalid-reset-login-link">Return to login</Link></div></div></div>;

  if (complete) return <div className="flex min-h-svh items-center justify-center bg-slate-100 px-5 dark:bg-slate-950"><div className="w-full max-w-md"><div className="mb-8 flex justify-center"><BrandMark /></div><div className="rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-xl shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"><CheckCircle2 size={35} className="mx-auto text-emerald-500" /><h1 className="mt-5 font-heading text-2xl font-semibold tracking-tight" data-testid="reset-complete-heading">Password updated</h1><p className="mt-2 text-sm leading-6 text-slate-500">Your reset link has been used and can no longer open the reset form.</p><Link to="/login" className={`${buttonVariants()} mt-6 w-full bg-indigo-600 hover:bg-indigo-700`} data-testid="reset-complete-login-link">Continue to login</Link></div></div></div>;

  return <div className="flex min-h-svh items-center justify-center bg-slate-100 px-5 dark:bg-slate-950"><div className="w-full max-w-md"><div className="mb-8 flex justify-center"><BrandMark /></div><div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"><div className="flex size-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"><KeyRound size={22} /></div><h1 className="mt-6 font-heading text-3xl font-semibold tracking-tight" data-testid="reset-password-heading">Create a new password</h1><p className="mt-2 text-sm text-slate-500">This form is available only through your one-time reset link.</p><form onSubmit={submit} className="mt-6 space-y-4" data-testid="reset-password-form"><label className="block text-sm font-semibold">New password<PasswordInput value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} autoComplete="new-password" data-testid="reset-new-password-input" toggleTestId="reset-new-password-toggle" /></label><label className="block text-sm font-semibold">Confirm password<PasswordInput value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setError(""); }} autoComplete="new-password" data-testid="reset-confirm-password-input" toggleTestId="reset-confirm-password-toggle" /></label>{error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300" role="alert" data-testid="reset-password-error">{error}</p>}<Button type="submit" className="h-11 w-full bg-indigo-600 hover:bg-indigo-700" data-testid="reset-password-submit-button">Reset password</Button></form></div></div></div>;
}