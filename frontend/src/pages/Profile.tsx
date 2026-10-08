import { useState } from "react";
import type { FormEvent } from "react";
import { Award, BookOpen, Check, Flame, KeyRound, LogOut, Settings2, UserRound, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import {
  createDemoPasswordReset,
  getDemoProfile,
  profileInitials,
  saveDemoProfile,
  verifyDemoPassword,
} from "@/lib/demoAuth";
import type { DemoProfile } from "@/lib/demoAuth";

const stats = [
  { Icon: Flame, value: "7 days", label: "Streak" },
  { Icon: BookOpen, value: "128", label: "Questions" },
  { Icon: Award, value: "78%", label: "Accuracy" },
];

export default function Profile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<DemoProfile>(() => getDemoProfile());
  const [draft, setDraft] = useState<DemoProfile>(() => getDemoProfile());
  const [editing, setEditing] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const clearPasswordForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
  };

  const openEditor = () => {
    setDraft(profile);
    setChangingPassword(false);
    clearPasswordForm();
    setSaved(false);
    setEditing(true);
  };

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (changingPassword) {
      if (!currentPassword || !newPassword || !confirmPassword) {
        setError("Complete all three password fields.");
        return;
      }
      if (!verifyDemoPassword(currentPassword)) {
        setError("Your current password is incorrect.");
        return;
      }
      if (newPassword.length < 8) {
        setError("Your new password must be at least 8 characters.");
        return;
      }
      if (newPassword !== confirmPassword) {
        setError("The new passwords do not match.");
        return;
      }
    }

    const updated = { ...draft, name: draft.name.trim() };
    saveDemoProfile(updated, changingPassword ? newPassword : undefined);
    setProfile(updated);
    setSaved(true);
    setEditing(false);
  };

  const recoverPassword = () => {
    createDemoPasswordReset();
    navigate("/forgot-password-sent");
  };

  const logout = () => {
    localStorage.removeItem("prepmind-chat-id");
    localStorage.removeItem("prepmind-demo-session");
    queryClient.clear();
    navigate("/login");
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600 dark:text-indigo-400" data-testid="profile-kicker">Learner profile</p>
            <h1 className="mt-2 font-heading text-4xl font-semibold tracking-tight" data-testid="profile-heading">Your profile</h1>
          </div>
          <Button variant="outline" onClick={logout} className="gap-2 border-rose-200 text-rose-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10" data-testid="profile-logout-button"><LogOut size={16} /> Logout</Button>
        </div>

        {saved && <div className="mt-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300" data-testid="profile-save-success"><Check size={16} /> Profile updated successfully.</div>}

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-4">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-indigo-100 text-xl font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300" data-testid="profile-avatar">{profileInitials(profile.name)}</div>
            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight" data-testid="profile-name">{profile.name}</h2>
              <p className="text-sm text-slate-500" data-testid="profile-study-status">{profile.targetExam} · {profile.currentClass}</p>
            </div>
            <Button variant="outline" size="sm" onClick={openEditor} className="ml-auto gap-2" data-testid="profile-edit-button"><Settings2 size={14} /> Edit</Button>
          </div>
          <div className="mt-8 grid grid-cols-3 gap-3">
            {stats.map(({ Icon, value, label }) => <div key={label} className="rounded-xl bg-slate-50 p-4 dark:bg-slate-950" data-testid={`profile-stat-${label.toLowerCase()}`}><Icon size={16} className="text-indigo-500" /><p className="mt-3 font-heading text-xl font-semibold">{value}</p><p className="mt-1 text-xs text-slate-500">{label}</p></div>)}
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3"><UserRound size={18} className="text-indigo-500" /><h2 className="font-heading text-lg font-semibold" data-testid="study-preferences-heading">Study preferences</h2></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2"><div><p className="text-xs text-slate-500">Target exam</p><p className="mt-1 text-sm font-semibold" data-testid="profile-target-exam">{profile.targetExam}</p></div><div><p className="text-xs text-slate-500">Current class</p><p className="mt-1 text-sm font-semibold" data-testid="profile-current-class">{profile.currentClass}</p></div></div>
        </div>
      </div>

      {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" data-testid="profile-edit-overlay">
        <div className="max-h-[92svh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title" data-testid="profile-edit-dialog">
          <div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600 dark:text-indigo-400" data-testid="profile-edit-kicker">Personalize PrepMind</p><h2 id="profile-editor-title" className="mt-1 font-heading text-2xl font-semibold tracking-tight" data-testid="profile-edit-title">Edit profile</h2></div><button onClick={() => setEditing(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" aria-label="Close profile editor" data-testid="profile-edit-close-button"><X size={18} /></button></div>

          <form onSubmit={save} className="mt-6 space-y-5" data-testid="profile-edit-form">
            <label className="block text-sm font-semibold">Full name<Input value={draft.name} onChange={(event) => { setDraft((current) => ({ ...current, name: event.target.value })); setError(""); }} className="mt-2" autoComplete="name" data-testid="profile-name-input" /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold">Target exam<select value={draft.targetExam} onChange={(event) => setDraft((current) => ({ ...current, targetExam: event.target.value as DemoProfile["targetExam"] }))} className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950" data-testid="profile-target-select"><option value="JEE Main">JEE Main</option><option value="JEE Advanced">JEE Advanced</option></select></label>
              <label className="block text-sm font-semibold">Current class<select value={draft.currentClass} onChange={(event) => setDraft((current) => ({ ...current, currentClass: event.target.value as DemoProfile["currentClass"] }))} className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950" data-testid="profile-class-select"><option value="Class 11">Class 11</option><option value="Class 12">Class 12</option><option value="Class 12 pass-out">Class 12 pass-out</option></select></label>
            </div>

            <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
              {!changingPassword ? <button type="button" onClick={() => { setChangingPassword(true); clearPasswordForm(); }} className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left transition-[border-color,background-color] hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-slate-700 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-500/10" data-testid="profile-change-password-button"><span className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"><KeyRound size={17} /></span><span><span className="block text-sm font-semibold">Change password</span><span className="mt-0.5 block text-xs text-slate-500">Update your demo account password</span></span></span><span className="text-slate-400">›</span></button> : <div data-testid="profile-password-section">
                <div className="flex items-start justify-between gap-4"><div><h3 className="text-sm font-semibold">Change password</h3><p className="mt-1 text-xs text-slate-500">Enter your current password before choosing a new one.</p></div><button type="button" onClick={() => { setChangingPassword(false); clearPasswordForm(); }} className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" data-testid="profile-cancel-password-button">Cancel</button></div>
                <div className="mt-4 space-y-4">
                  <label className="block text-sm font-semibold">Current password<PasswordInput value={currentPassword} onChange={(event) => { setCurrentPassword(event.target.value); setError(""); }} placeholder="Enter current password" autoComplete="current-password" data-testid="profile-current-password-input" toggleTestId="profile-current-password-toggle" /></label>
                  <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold">New password<PasswordInput value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setError(""); }} placeholder="At least 8 characters" autoComplete="new-password" data-testid="profile-new-password-input" toggleTestId="profile-new-password-toggle" /></label><label className="block text-sm font-semibold">Confirm password<PasswordInput value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setError(""); }} placeholder="Repeat password" autoComplete="new-password" data-testid="profile-confirm-password-input" toggleTestId="profile-confirm-password-toggle" /></label></div>
                </div>
                <button type="button" onClick={recoverPassword} className="mt-3 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400" data-testid="profile-forgot-password-button">Forgot password?</button>
              </div>}
            </div>

            {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300" role="alert" data-testid="profile-edit-error">{error}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditing(false)} data-testid="profile-edit-cancel-button">Cancel</Button><Button type="submit" className="gap-2 bg-indigo-600 hover:bg-indigo-700" data-testid="profile-edit-save-button"><Check size={15} /> Save changes</Button></div>
          </form>
        </div>
      </div>}
    </div>
  );
}