import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { CheckCircle2, KeyRound, LoaderCircle, ShieldX } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { BrandMark } from "@/components/BrandMark";
import { Button, buttonVariants } from "@/components/ui/button";
import { PasswordInput } from "@/components/PasswordInput";
import { api, ApiError } from "@/lib/api";

type LinkState = { status: "checking" } | { status: "valid"; email: string } | { status: "invalid"; message: string } | { status: "done"; email: string };

function Card({ children }: { children: ReactNode }) {
  return <div className="flex min-h-svh items-center justify-center bg-slate-100 px-5 dark:bg-slate-950"><div className="w-full max-w-md"><div className="mb-8 flex justify-center"><BrandMark /></div><div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">{children}</div></div></div>;
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [link, setLink] = useState<LinkState>(token ? { status: "checking" } : { status: "invalid", message: "This page only opens from the reset link in your email." });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const checked = useRef(false);

  // The form is shown only after the server confirms the link is live.
  useEffect(() => {
    if (!token || checked.current) return;
    checked.current = true;
    api.validateResetToken(token)
      .then(({ email }) => setLink({ status: "valid", email }))
      .catch((err) => setLink({ status: "invalid", message: err instanceof ApiError ? err.message : "Couldn't reach the server. Refresh to try again." }));
  }, [token]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < 8) {
      setError("Your new password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      const { email } = await api.resetPassword(token!, password);
      setLink({ status: "done", email });
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) setLink({ status: "invalid", message: err.message });
      else setError(err instanceof ApiError ? err.message : "Unable to connect to the server. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (link.status === "checking") return <Card><div className="flex flex-col items-center py-6 text-center"><LoaderCircle size={28} className="animate-spin text-indigo-600" /><p className="mt-4 text-sm text-slate-500" data-testid="reset-checking">Checking your reset link…</p></div></Card>;

  if (link.status === "invalid") return <Card><div className="text-center"><ShieldX size={35} className="mx-auto text-rose-500" /><h1 className="mt-5 font-heading text-2xl font-semibold tracking-tight" data-testid="invalid-reset-heading">Reset link not valid</h1><p className="mt-2 text-sm leading-6 text-slate-500" data-testid="invalid-reset-description">{link.message}</p><Link to="/forgot-password" className={`${buttonVariants()} mt-6 w-full bg-indigo-600 hover:bg-indigo-700`} data-testid="invalid-reset-new-link">Request a new link</Link><Link to="/login" className="mt-4 block text-sm font-semibold text-slate-500 hover:text-indigo-600" data-testid="invalid-reset-login-link">Back to login</Link></div></Card>;

  if (link.status === "done") return <Card><div className="text-center"><CheckCircle2 size={35} className="mx-auto text-emerald-500" /><h1 className="mt-5 font-heading text-2xl font-semibold tracking-tight" data-testid="reset-complete-heading">Password updated</h1><p className="mt-2 text-sm leading-6 text-slate-500">Log in with your new password. This reset link can no longer be used.</p><Link to="/login" state={{ email: link.email, message: "Password updated. Log in with your new password." }} className={`${buttonVariants()} mt-6 w-full bg-indigo-600 hover:bg-indigo-700`} data-testid="reset-complete-login-link">Continue to login</Link></div></Card>;

  return <Card><div className="flex size-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"><KeyRound size={22} /></div><h1 className="mt-6 font-heading text-3xl font-semibold tracking-tight" data-testid="reset-password-heading">Create a new password</h1><p className="mt-2 text-sm text-slate-500">For <strong className="text-slate-800 dark:text-slate-200">{link.email}</strong></p><form onSubmit={submit} className="mt-6 space-y-4" data-testid="reset-password-form"><label className="block text-sm font-semibold">New password<PasswordInput value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} placeholder="At least 8 characters" autoComplete="new-password" data-testid="reset-new-password-input" toggleTestId="reset-new-password-toggle" /></label><label className="block text-sm font-semibold">Confirm password<PasswordInput value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setError(""); }} placeholder="Repeat password" autoComplete="new-password" data-testid="reset-confirm-password-input" toggleTestId="reset-confirm-password-toggle" /></label>{error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300" role="alert" data-testid="reset-password-error">{error}</p>}<Button type="submit" disabled={saving} className="h-11 w-full bg-indigo-600 hover:bg-indigo-700" data-testid="reset-password-submit-button">{saving ? "Saving…" : "Reset password"}</Button></form></Card>;
}
