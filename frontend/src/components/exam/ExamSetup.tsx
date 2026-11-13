import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpenCheck, ChevronRight, Clock3, History, LoaderCircle, Play, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { ExamHistoryItem } from "@/lib/types";
import { DifficultyMix } from "@/components/exam/DifficultyMix";
import { levelRule } from "@/lib/difficulty";

const SUBJECT_COLORS: Record<string, string> = { Physics: "bg-indigo-500", Chemistry: "bg-teal-600", Mathematics: "bg-orange-600" };

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function HistoryRow({ item, onOpen }: { item: ExamHistoryItem; onOpen: () => void }) {
  const label = item.status === "submitted"
    ? `${item.total_score ?? 0} / ${item.max_score}`
    : item.status === "failed" ? "Couldn't prepare" : item.status === "preparing" ? "Preparing…" : "In progress";
  return (
    <button onClick={onOpen} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60" data-testid={`exam-history-${item.id}`}>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{item.title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{formatDate(item.started_at)}{item.status === "submitted" ? ` · ${item.correct_count} correct · ${item.accuracy}% accuracy` : ""}</p>
      </div>
      <span className={`flex shrink-0 items-center gap-1 text-sm font-semibold ${item.status === "submitted" ? "text-slate-900 dark:text-white" : "text-slate-500"}`}>{label}<ChevronRight size={15} className="text-slate-400" /></span>
    </button>
  );
}

export function ExamSetup({ onOpen }: { onOpen: (attemptId: string) => void }) {
  const bank = useQuery({ queryKey: ["exam-bank-status"], queryFn: api.getExamBankStatus });
  const history = useQuery({ queryKey: ["exam-history"], queryFn: api.getExamHistory });
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const active = history.data?.find((a) => a.status === "preparing" || a.status === "in_progress");
  const past = history.data?.filter((a) => a !== active && a.status !== "failed") ?? [];
  const template = bank.data?.template;

  const start = async () => {
    setStarting(true);
    setError("");
    try {
      const attempt = await api.startExamAttempt();
      onOpen(attempt.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach the server. Try again.");
      setStarting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <div className="mb-8 max-w-2xl">
          <div className="mb-3 flex items-center gap-2 text-indigo-600 dark:text-indigo-400"><ShieldCheck size={17} /><span className="text-xs font-bold uppercase tracking-[.18em]">Test your readiness</span></div>
          <h1 className="font-heading text-4xl font-semibold tracking-tight" data-testid="exam-heading">JEE Main Mock Test</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500" data-testid="exam-subtitle">A full-length paper in the real JEE Main pattern, written from your NCERT books. Chapters where you lose marks become priority topics in your Daily 20.</p>
        </div>

        {active && (
          <div className="mb-6 flex flex-col justify-between gap-4 rounded-2xl border border-indigo-200 bg-indigo-50/70 p-5 sm:flex-row sm:items-center dark:border-indigo-500/30 dark:bg-indigo-500/10" data-testid="exam-active-card">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">{active.status === "preparing" ? "Paper being prepared" : "Exam in progress"}</p>
              <p className="mt-1 text-sm text-indigo-950/80 dark:text-indigo-100/80">{active.status === "preparing" ? "Your questions are still being written. You can watch the progress." : "Your answers are saved and the timer is still running."}</p>
            </div>
            <Button onClick={() => onOpen(active.id)} className="gap-2 bg-indigo-600 hover:bg-indigo-700" data-testid="exam-resume-button">Resume <ChevronRight size={15} /></Button>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-heading text-lg font-semibold tracking-tight">Paper pattern</h2>
            <div className="mt-5 grid grid-cols-3 gap-3">
              {[["Questions", template ? String(template.total_questions) : "75"], ["Duration", `${template?.duration_minutes ?? 180} min`], ["Max marks", template ? String(template.total_questions * template.default_marks) : "300"]].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950"><p className="text-[11px] uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 font-heading text-xl font-semibold">{value}</p></div>
              ))}
            </div>
            <div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {(bank.data?.subjects ?? (["Physics", "Chemistry", "Mathematics"] as const).map((subject) => ({ subject, needed: { mcq: 20, numerical: 5 }, available: { mcq: 0, numerical: 0 }, to_generate: 0 }))).map((row) => (
                <div key={row.subject} className="flex items-center justify-between gap-3 px-4 py-3 text-sm" data-testid={`exam-pattern-${row.subject.toLowerCase()}`}>
                  <span className="flex items-center gap-2 font-semibold"><span className={`size-2 rounded-full ${SUBJECT_COLORS[row.subject]}`} />{row.subject}</span>
                  <span className="text-slate-500">{row.needed.mcq} MCQ + {row.needed.numerical} numerical</span>
                </div>
              ))}
            </div>

            {bank.data && (
              <div className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-slate-800" data-testid="exam-difficulty-level">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">Difficulty: {bank.data.difficulty.label} level</p>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Adapts to you</span>
                </div>
                <DifficultyMix difficulty={bank.data.difficulty} />
                <p className="mt-3 text-xs leading-5 text-slate-500">{levelRule(bank.data.difficulty)}</p>
              </div>
            )}

            <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-950" data-testid="exam-bank-status">
              {bank.isLoading ? <span className="flex items-center gap-2 text-slate-500"><LoaderCircle size={15} className="animate-spin" /> Checking the question bank…</span>
                : bank.data && bank.data.to_generate === 0 ? <span className="flex items-start gap-2 text-emerald-700 dark:text-emerald-300"><BookOpenCheck size={16} className="mt-0.5 shrink-0" /> All 75 questions are ready in the bank. The paper starts instantly.</span>
                : bank.data ? <span className="flex items-start gap-2 text-slate-600 dark:text-slate-300"><Sparkles size={16} className="mt-0.5 shrink-0 text-indigo-500" /><span>{bank.data.to_generate} new questions will be written from the NCERT chapters first (about {bank.data.estimated_minutes} min). The timer starts only when the paper is ready.</span></span>
                : <span className="text-rose-600">Couldn't check the question bank.</span>}
            </div>

            {error && <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300" role="alert">{error}</p>}
            <Button onClick={start} disabled={starting || !!active} className="mt-6 h-12 w-full gap-2 bg-indigo-600 hover:bg-indigo-700" data-testid="start-exam-button">
              {starting ? <LoaderCircle size={16} className="animate-spin" /> : <Play size={16} fill="currentColor" />} {active ? "Finish your current paper first" : "Start JEE Main mock test"}
            </Button>
          </section>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-6 dark:border-indigo-500/20 dark:bg-indigo-500/10">
              <Clock3 size={20} className="text-indigo-600 dark:text-indigo-300" />
              <h2 className="mt-4 font-heading text-lg font-semibold tracking-tight">Marking scheme</h2>
              <div className="mt-3 space-y-2 text-xs leading-5 text-indigo-950/75 dark:text-indigo-100/75">
                <p>• +4 for a correct answer, −1 for a wrong one, 0 if unanswered (MCQ and numerical).</p>
                <p>• Numerical answers are typed in as a number.</p>
                <p>• Answers save as you go. The paper submits itself when time runs out.</p>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-2 flex items-center gap-2 px-2 text-sm font-semibold"><History size={15} className="text-slate-400" /> Past papers</h2>
              {history.isLoading ? <p className="px-2 py-3 text-xs text-slate-500">Loading…</p>
                : past.length === 0 ? <p className="px-2 py-3 text-xs text-slate-500">Your finished papers will appear here.</p>
                : <div className="space-y-0.5">{past.slice(0, 8).map((item) => <HistoryRow key={item.id} item={item} onOpen={() => onOpen(item.id)} />)}</div>}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
