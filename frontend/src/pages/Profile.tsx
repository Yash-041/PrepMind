import { useState } from "react";
import type { FormEvent } from "react";
import { Award, BookOpen, Check, Flame, KeyRound, LogOut, Settings2, UserRound, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { profileInitials } from "@/lib/demoAuth";
import { api, ApiError } from "@/lib/api";
import { clearSession, getSessionUser, updateSessionUser } from "@/lib/session";
import type { SessionUser } from "@/lib/session";

type TargetExam = SessionUser["target_exam"];
type StudentClass = SessionUser["student_class"];
type Draft = { full_name: string; target_exam: TargetExam; student_class: StudentClass };

const CLASS_LABELS: Record<StudentClass, string> = {
  "Class 11": "Class 11",
  "Class 12": "Class 12",
  "Class 12 pass out": "Class 12 pass-out",
};

export default function Profile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // The cached session user renders instantly; /auth/me refreshes it from the database.
  const meQuery = useQuery({ queryKey: ["me"], queryFn: api.me, initialData: getSessionUser() ?? undefined });
  const overviewQuery = useQuery({ queryKey: ["progress-overview"], queryFn: api.getProgressOverview });
  const profile = meQuery.data;

  const [draft, setDraft] = useState<Draft>({ full_name: "", target_exam: "JEE Main", student_class: "Class 12" });
  const [editing, setEditing] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const overview = overviewQuery.data;
  const stats = [
    { Icon: BookOpen, value: overview ? String(overview.total_questions_attempted) : "–", label: "Questions" },
    { Icon: Award, value: overview ? `${Math.round(overview.overall_accuracy)}%` : "–", label: "Accuracy" },
    { Icon: Flame, value: overview ? String(overview.daily_sets_completed) : "–", label: "Daily sets" },
  ];

  const clearPasswordForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
  };

  const openEditor = () => {
    if (!profile) return;
    setDraft({ full_name: profile.full_name, target_exam: profile.target_exam, student_class: profile.student_class });
    setChangingPassword(false);
    clearPasswordForm();
    setSaved(false);
    setEditing(true);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft.full_name.trim().length < 2) {
      setError("Please enter your name.");
      return;
    }
    if (changingPassword) {
      if ((profile?.has_password && !currentPassword) || !newPassword || !confirmPassword) {
        setError("Complete all the password fields.");
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

    setSaving(true);
    try {
      // Password first: if the current password is wrong, nothing else is saved either.
      if (changingPassword) {
        await api.changePassword({ current_password: currentPassword || undefined, new_password: newPassword });
      }
      const updated = await api.updateMe({ ...draft, full_name: draft.full_name.trim() });
      queryClient.setQueryData(["me"], updated);
      updateSessionUser(updated);
      setSaved(true);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const logout = () => {
    clearSession();
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
        {meQuery.isError && <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300" data-testid="profile-load-error">Couldn't refresh your profile from the server.</div>}

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-4">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-indigo-100 text-xl font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300" data-testid="profile-avatar">{profileInitials(profile?.full_name ?? "")}</div>
            <div className="min-w-0">
              <h2 className="truncate font-heading text-xl font-semibold tracking-tight" data-testid="profile-name">{profile?.full_name ?? "…"}</h2>
              <p className="truncate text-sm text-slate-500" data-testid="profile-email">{profile?.email}</p>
              <p className="text-sm text-slate-500" data-testid="profile-study-status">{profile ? `${profile.target_exam} · ${CLASS_LABELS[profile.student_class] ?? profile.student_class}` : ""}</p>
            </div>
            <Button variant="outline" size="sm" onClick={openEditor} disabled={!profile} className="ml-auto gap-2" data-testid="profile-edit-button"><Settings2 size={14} /> Edit</Button>
          </div>
          <div className="mt-8 grid grid-cols-3 gap-3">
            {stats.map(({ Icon, value, label }) => <div key={label} className="rounded-xl bg-slate-50 p-4 dark:bg-slate-950" data-testid={`profile-stat-${label.toLowerCase().replace(" ", "-")}`}><Icon size={16} className="text-indigo-500" /><p className="mt-3 font-heading text-xl font-semibold">{value}</p><p className="mt-1 text-xs text-slate-500">{label}</p></div>)}
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3"><UserRound size={18} className="text-indigo-500" /><h2 className="font-heading text-lg font-semibold" data-testid="study-preferences-heading">Study preferences</h2></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3"><div><p className="text-xs text-slate-500">Target exam</p><p className="mt-1 text-sm font-semibold" data-testid="profile-target-exam">{profile?.target_exam}</p></div><div><p className="text-xs text-slate-500">Current class</p><p className="mt-1 text-sm font-semibold" data-testid="profile-current-class">{profile ? CLASS_LABELS[profile.student_class] ?? profile.student_class : ""}</p></div><div><p className="text-xs text-slate-500">Sign-in method</p><p className="mt-1 text-sm font-semibold capitalize" data-testid="profile-auth-provider">{profile?.auth_provider}</p></div></div>
        </div>
      </div>

      {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" data-testid="profile-edit-overlay">
        <div className="max-h-[92svh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title" data-testid="profile-edit-dialog">
          <div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600 dark:text-indigo-400" data-testid="profile-edit-kicker">Personalize PrepMind</p><h2 id="profile-editor-title" className="mt-1 font-heading text-2xl font-semibold tracking-tight" data-testid="profile-edit-title">Edit profile</h2></div><button onClick={() => setEditing(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" aria-label="Close profile editor" data-testid="profile-edit-close-button"><X size={18} /></button></div>

          <form onSubmit={save} className="mt-6 space-y-5" data-testid="profile-edit-form">
            <label className="block text-sm font-semibold">Full name<Input value={draft.full_name} onChange={(event) => { setDraft((current) => ({ ...current, full_name: event.target.value })); setError(""); }} className="mt-2" autoComplete="name" data-testid="profile-name-input" /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold">Target exam<select value={draft.target_exam} onChange={(event) => setDraft((current) => ({ ...current, target_exam: event.target.value as TargetExam }))} className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950" data-testid="profile-target-select"><option value="JEE Main">JEE Main</option><option value="JEE Advanced">JEE Advanced</option></select></label>
              <label className="block text-sm font-semibold">Current class<select value={draft.student_class} onChange={(event) => setDraft((current) => ({ ...current, student_class: event.target.value as StudentClass }))} className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950" data-testid="profile-class-select">{(Object.keys(CLASS_LABELS) as StudentClass[]).map((value) => <option key={value} value={value}>{CLASS_LABELS[value]}</option>)}</select></label>
            </div>

            <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
              {!changingPassword ? <button type="button" onClick={() => { setChangingPassword(true); clearPasswordForm(); }} className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left transition-[border-color,background-color] hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-slate-700 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-500/10" data-testid="profile-change-password-button"><span className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"><KeyRound size={17} /></span><span><span className="block text-sm font-semibold">{profile?.has_password ? "Change password" : "Set a password"}</span><span className="mt-0.5 block text-xs text-slate-500">{profile?.has_password ? "Update your account password" : "Also log in with email and password, not only Google"}</span></span></span><span className="text-slate-400">›</span></button> : <div data-testid="profile-password-section">
                <div className="flex items-start justify-between gap-4"><div><h3 className="text-sm font-semibold">{profile?.has_password ? "Change password" : "Set a password"}</h3><p className="mt-1 text-xs text-slate-500">{profile?.has_password ? "Enter your current password before choosing a new one." : "Choose a password for email login."}</p></div><button type="button" onClick={() => { setChangingPassword(false); clearPasswordForm(); }} className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" data-testid="profile-cancel-password-button">Cancel</button></div>
                <div className="mt-4 space-y-4">
                  {profile?.has_password && <label className="block text-sm font-semibold">Current password<PasswordInput value={currentPassword} onChange={(event) => { setCurrentPassword(event.target.value); setError(""); }} placeholder="Enter current password" autoComplete="current-password" data-testid="profile-current-password-input" toggleTestId="profile-current-password-toggle" /></label>}
                  <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold">New password<PasswordInput value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setError(""); }} placeholder="At least 8 characters" autoComplete="new-password" data-testid="profile-new-password-input" toggleTestId="profile-new-password-toggle" /></label><label className="block text-sm font-semibold">Confirm password<PasswordInput value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setError(""); }} placeholder="Repeat password" autoComplete="new-password" data-testid="profile-confirm-password-input" toggleTestId="profile-confirm-password-toggle" /></label></div>
                </div>
              </div>}
            </div>

            {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300" role="alert" data-testid="profile-edit-error">{error}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditing(false)} data-testid="profile-edit-cancel-button">Cancel</Button><Button type="submit" disabled={saving} className="gap-2 bg-indigo-600 hover:bg-indigo-700" data-testid="profile-edit-save-button"><Check size={15} /> {saving ? "Saving…" : "Save changes"}</Button></div>
          </form>
        </div>
      </div>}
    </div>
  );
}
