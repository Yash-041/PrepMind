import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowUp, BookOpen, Check, ChevronDown, Gauge, Minus, Target, Trophy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MathText } from "@/components/MathText";
import type { ExamResult, ExamReviewQuestion } from "@/lib/types";
import { levelRule } from "@/lib/difficulty";

const SUBJECT_BAR: Record<string, string> = { Physics: "bg-indigo-600", Chemistry: "bg-teal-600", Mathematics: "bg-orange-600" };
const SEVERITY: Record<string, { label: string; style: string }> = {
  high: { label: "High priority", style: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
  medium: { label: "Medium priority", style: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
  low: { label: "Low priority", style: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  none: { label: "Skipped only", style: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
};
type Filter = "all" | "incorrect" | "unanswered" | "correct";

function duration(seconds: number) {
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}

function outcome(q: ExamReviewQuestion): Exclude<Filter, "all"> {
  if (!q.selected_option) return "unanswered";
  return q.is_correct ? "correct" : "incorrect";
}

function ReviewItem({ q }: { q: ExamReviewQuestion }) {
  const [open, setOpen] = useState(false);
  const result = outcome(q);
  const badge = result === "correct" ? <span className="flex items-center gap-1 text-emerald-600"><Check size={14} /> +{q.marks_awarded}</span>
    : result === "incorrect" ? <span className="flex items-center gap-1 text-rose-600"><X size={14} /> {q.marks_awarded}</span>
    : <span className="flex items-center gap-1 text-slate-400"><Minus size={14} /> 0</span>;
  return (
    <li className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" data-testid={`exam-review-${q.order_index}`}>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="w-8 shrink-0 text-xs font-semibold text-slate-400">Q{q.order_index}</span>
        <span className="min-w-0 flex-1 truncate text-sm"><span className="font-semibold">{q.subject}</span><span className="text-slate-500"> · {q.topic}</span></span>
        <span className="shrink-0 text-xs font-semibold">{badge}</span>
        <ChevronDown size={15} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 text-sm dark:border-slate-800">
          <MathText text={q.question_text} className="leading-7 text-slate-800 dark:text-slate-100" />
          {q.question_type === "mcq" ? (
            <div className="mt-3 grid gap-2">
              {q.options.map((option, i) => {
                const isAnswer = option === q.correct_answer;
                const isChosen = option === q.selected_option;
                return (
                  <div key={i} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${isAnswer ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10" : isChosen ? "border-rose-300 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-500/10" : "border-slate-200 dark:border-slate-700"}`}>
                    <span className="text-xs font-bold text-slate-500">{String.fromCharCode(65 + i)}</span>
                    <MathText text={option} inline className="min-w-0 flex-1" />
                    {isAnswer && <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Correct</span>}
                    {isChosen && !isAnswer && <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">Your answer</span>}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 text-sm">Your answer: <b className={q.is_correct ? "text-emerald-600" : "text-rose-600"}>{q.selected_option ?? "—"}</b> · Correct answer: <b className="text-emerald-600">{q.correct_answer}</b></p>
          )}
          <div className="mt-4 rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Solution</p>
            <MathText text={q.explanation} className="leading-6 text-slate-700 dark:text-slate-300" />
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
            {q.source_ref && <span className="flex items-center gap-1"><BookOpen size={12} /> {q.source_ref}</span>}
            <span>{q.difficulty}</span>
            <span>{Math.round(q.time_spent_seconds)}s spent</span>
          </p>
        </div>
      )}
    </li>
  );
}

const LEVEL_ORDER = ["foundation", "jee_main", "advanced"];
const DIFFICULTY_BAR: Record<string, string> = { Easy: "bg-emerald-500", Medium: "bg-amber-500", Hard: "bg-rose-500" };

function LevelPanel({ result }: { result: ExamResult }) {
  const step = LEVEL_ORDER.indexOf(result.next_difficulty.level) - LEVEL_ORDER.indexOf(result.difficulty.level);
  const next = result.next_difficulty;
  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900" data-testid="exam-difficulty-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-heading text-lg font-semibold tracking-tight"><Gauge size={17} className="text-indigo-500" /> {result.difficulty.label} level paper</h2>
          <p className="mt-1 text-xs text-slate-500">{result.difficulty.mix.Easy}% Easy · {result.difficulty.mix.Medium}% Medium · {result.difficulty.mix.Hard}% Hard</p>
        </div>
        <p className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${step > 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : step < 0 ? "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`} data-testid="exam-next-level">
          {step > 0 ? <ArrowUp size={13} /> : step < 0 ? <ArrowDown size={13} /> : null}
          {step > 0 ? `Moved up: next paper is ${next.label}` : step < 0 ? `Next paper drops to ${next.label}` : `Next paper stays at ${next.label}`}
        </p>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {["Easy", "Medium", "Hard"].map((d) => {
          const b = result.difficulty_breakdown[d] ?? { total: 0, correct: 0 };
          return (
            <div key={d}>
              <div className="mb-1.5 flex justify-between text-sm"><span className="font-semibold">{d}</span><span className="text-slate-500 tabular-nums">{b.correct} / {b.total} correct</span></div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800"><div className={`h-full rounded-full ${DIFFICULTY_BAR[d]}`} style={{ width: `${b.total ? (b.correct / b.total) * 100 : 0}%` }} /></div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-500">{levelRule(next)}</p>
    </div>
  );
}

export function ExamResultView({ result, onBack }: { result: ExamResult; onBack: () => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [subject, setSubject] = useState<string>("All");
  const subjects = Object.keys(result.subject_breakdown);
  const weakForDaily = result.weak_topics.filter((t) => t.weak_severity !== "none");

  const shown = useMemo(
    () => result.questions.filter((q) => (filter === "all" || outcome(q) === filter) && (subject === "All" || q.subject === subject)),
    [result.questions, filter, subject],
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <button onClick={onBack} className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-600" data-testid="exam-result-back-button"><ArrowLeft size={16} /> All mock tests</button>
        <div className="mb-8 flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"><Trophy size={22} /></div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600 dark:text-indigo-400" data-testid="exam-result-kicker">Paper submitted</p>
            <h1 className="mt-1 font-heading text-4xl font-semibold tracking-tight" data-testid="exam-result-heading">{result.total_score} <span className="text-2xl text-slate-400">/ {result.max_score}</span></h1>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[["Correct", result.correct_count, "text-emerald-600"], ["Incorrect", result.incorrect_count, "text-rose-600"], ["Unanswered", result.unanswered_count, "text-slate-500"], ["Accuracy", `${result.accuracy}%`, ""], ["Time used", duration(result.time_spent_seconds), ""]].map(([label, value, color]) => (
            <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><p className="text-xs text-slate-500">{label}</p><p className={`mt-2 font-heading text-2xl font-semibold tracking-tight ${color}`} data-testid={`exam-result-${String(label).toLowerCase().replace(" ", "-")}`}>{value}</p></div>
          ))}
        </div>

        <LevelPanel result={result} />

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-heading text-lg font-semibold tracking-tight" data-testid="exam-performance-heading">Subject scores</h2>
            <div className="mt-5 space-y-5">
              {subjects.map((s) => {
                const b = result.subject_breakdown[s];
                const pct = b.max_score ? Math.max(0, Math.round((b.score / b.max_score) * 100)) : 0;
                return (
                  <div key={s} data-testid={`exam-subject-${s.toLowerCase()}`}>
                    <div className="mb-1.5 flex justify-between text-sm"><span className="font-semibold">{s}</span><span className="text-slate-500"><b className="text-slate-900 dark:text-white">{b.score}</b> / {b.max_score}</span></div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800"><div className={`h-full rounded-full ${SUBJECT_BAR[s] ?? "bg-indigo-600"}`} style={{ width: `${pct}%` }} /></div>
                    <p className="mt-1.5 text-xs text-slate-500">{b.correct} correct · {b.incorrect} incorrect · {b.unanswered} unanswered</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-6 dark:border-amber-500/20 dark:bg-amber-500/10" data-testid="exam-weak-topics">
            <div className="flex items-center gap-2"><Target size={17} className="text-amber-700 dark:text-amber-300" /><h2 className="font-heading text-lg font-semibold tracking-tight text-amber-950 dark:text-amber-100">Chapters to work on</h2></div>
            {result.weak_topics.length === 0 ? (
              <p className="mt-3 text-sm text-amber-900/75 dark:text-amber-100/75">No marks lost in any chapter. Excellent paper!</p>
            ) : (
              <>
                <p className="mt-2 text-xs leading-5 text-amber-900/75 dark:text-amber-100/75">{weakForDaily.length > 0 ? `${weakForDaily.length} chapter${weakForDaily.length > 1 ? "s are" : " is"} now a priority topic in your Daily 20. Questions for them are being prepared.` : "Only skipped questions here. Attempt them next time to track these chapters."}</p>
                <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
                  {result.weak_topics.map((t) => (
                    <li key={`${t.subject}-${t.topic}`} className="rounded-xl bg-white/70 px-3 py-2.5 dark:bg-slate-900/60">
                      <div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold text-slate-900 dark:text-white">{t.topic}</p><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${SEVERITY[t.weak_severity].style}`}>{SEVERITY[t.weak_severity].label}</span></div>
                      <p className="mt-0.5 text-xs text-slate-500">{t.subject} · {t.incorrect} wrong, {t.unanswered} skipped{t.overall_accuracy !== null ? ` · ${Math.round(t.overall_accuracy)}% accuracy overall` : ""}</p>
                    </li>
                  ))}
                </ul>
                <Link to="/daily" className="mt-4 inline-block text-sm font-semibold text-amber-800 hover:underline dark:text-amber-200">Go to Daily 20 →</Link>
              </>
            )}
          </div>
        </div>

        <div className="mt-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-semibold tracking-tight">Review answers</h2>
            <div className="flex flex-wrap gap-2">
              <select value={subject} onChange={(e) => setSubject(e.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900" data-testid="exam-review-subject">
                {["All", ...subjects].map((s) => <option key={s}>{s}</option>)}
              </select>
              {(["all", "incorrect", "unanswered", "correct"] as Filter[]).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={`h-8 rounded-lg px-3 text-xs font-semibold capitalize ${filter === f ? "bg-indigo-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700"}`} data-testid={`exam-review-filter-${f}`}>{f}</button>
              ))}
            </div>
          </div>
          {shown.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">No questions match this filter.</p>
            : <ul className="space-y-2">{shown.map((q) => <ReviewItem key={q.id} q={q} />)}</ul>}
        </div>

        <div className="mt-8"><Button onClick={onBack} variant="outline">Back to mock tests</Button></div>
      </div>
    </div>
  );
}
