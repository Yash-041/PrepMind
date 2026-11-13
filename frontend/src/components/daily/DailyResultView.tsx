import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown, Flame, Minus, Target, Trophy, X } from "lucide-react";
import { MathText } from "@/components/MathText";
import type { DailyResult, DailyReviewQuestion, DailyStreak } from "@/lib/types";

const SUBJECT_BAR: Record<string, string> = { Physics: "bg-indigo-600", Chemistry: "bg-teal-600", Mathematics: "bg-orange-600" };
type Filter = "all" | "incorrect" | "unanswered" | "correct";

function outcome(q: DailyReviewQuestion): Exclude<Filter, "all"> {
  if (!q.selected_option) return "unanswered";
  return q.is_correct ? "correct" : "incorrect";
}

function ReviewItem({ q }: { q: DailyReviewQuestion }) {
  const [open, setOpen] = useState(false);
  const result = outcome(q);
  const badge = result === "correct" ? <span className="flex items-center gap-1 text-emerald-600"><Check size={14} /> Right</span>
    : result === "incorrect" ? <span className="flex items-center gap-1 text-rose-600"><X size={14} /> Wrong</span>
    : <span className="flex items-center gap-1 text-slate-400"><Minus size={14} /> Skipped</span>;
  return (
    <li className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" data-testid={`daily-review-${q.order_index}`}>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="w-8 shrink-0 text-xs font-semibold text-slate-400">Q{q.order_index}</span>
        <span className="min-w-0 flex-1 truncate text-sm"><span className="font-semibold">{q.subject}</span><span className="text-slate-500"> · {q.topic}</span></span>
        <span className="shrink-0 text-xs font-semibold">{badge}</span>
        <ChevronDown size={15} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 text-sm dark:border-slate-800">
          <MathText text={q.question_text} className="leading-7 text-slate-800 dark:text-slate-100" />
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
          <div className="mt-4 rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Solution</p>
            <MathText text={q.explanation} className="leading-6 text-slate-700 dark:text-slate-300" />
          </div>
        </div>
      )}
    </li>
  );
}

export function DailyResultView({ result, streak }: { result: DailyResult; streak?: DailyStreak }) {
  const [filter, setFilter] = useState<Filter>("all");
  const subjects = useMemo(() => {
    const totals: Record<string, { total: number; correct: number }> = {};
    for (const q of result.questions) {
      const entry = (totals[q.subject] ??= { total: 0, correct: 0 });
      entry.total += 1;
      if (q.is_correct) entry.correct += 1;
    }
    return Object.entries(totals);
  }, [result.questions]);
  const counts: Record<Filter, number> = { all: result.questions.length, correct: result.correct_count, incorrect: result.incorrect_count, unanswered: result.unanswered_count };
  const filterLabels: Record<Filter, string> = { all: "All", correct: "Right", incorrect: "Wrong", unanswered: "Unanswered" };
  const shown = filter === "all" ? result.questions : result.questions.filter((q) => outcome(q) === filter);
  const streakDays = streak?.current_streak ?? 0;

  return (
    <>
      <div className="mb-8 max-w-2xl">
        <div className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"><Trophy size={20} /></div>
        <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-600" data-testid="daily-result-kicker">Daily 20 complete</p>
        <h1 className="mt-2 font-heading text-4xl font-semibold tracking-tight" data-testid="daily-result-heading">
          {result.counted_for_streak ? `${streakDays}-day streak. Keep it going.` : "Set submitted."}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
          {result.counted_for_streak
            ? "Today's set counts towards your streak. Go through your mistakes below, then come back tomorrow for a new set."
            : "This set was submitted after its day ended, so it doesn't count towards your streak. Today's set will."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Right", `${result.correct_count} / ${result.questions.length}`, "text-emerald-600"],
          ["Wrong", String(result.incorrect_count), "text-rose-600"],
          ["Unanswered", String(result.unanswered_count), ""],
          ["Streak", `${streakDays} ${streakDays === 1 ? "day" : "days"}`, ""],
        ].map(([label, value, color]) => (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" key={label}>
            <p className="flex items-center gap-1 text-xs text-slate-500">{label === "Streak" && <Flame size={12} className="text-orange-500" />}{label}</p>
            <p className={`mt-2 font-heading text-2xl font-semibold tracking-tight tabular-nums ${color}`} data-testid={`daily-result-${label.toLowerCase()}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-heading text-lg font-semibold tracking-tight" data-testid="daily-subject-performance-heading">Subject performance</h2>
            <p className="mt-1 text-xs text-slate-500">Questions correct in today's set</p>
          </div>
          <Target size={19} className="text-indigo-500" />
        </div>
        <div className="space-y-4">
          {subjects.map(([subject, { total, correct }]) => (
            <div key={subject} data-testid={`daily-subject-score-${subject.toLowerCase()}`}>
              <div className="mb-1.5 flex justify-between text-sm"><span className="font-semibold">{subject}</span><span className="text-slate-500">{correct} / {total}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className={`h-full rounded-full ${SUBJECT_BAR[subject] ?? "bg-indigo-600"}`} style={{ width: `${(correct / total) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-semibold tracking-tight">Review answers</h2>
          <div className="flex flex-wrap gap-1.5">
            {(["all", "incorrect", "unanswered", "correct"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === f ? "bg-indigo-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800"}`} data-testid={`daily-review-filter-${f}`}>
                {filterLabels[f]} ({counts[f]})
              </button>
            ))}
          </div>
        </div>
        {shown.length ? <ul className="space-y-2">{shown.map((q) => <ReviewItem key={q.question_id} q={q} />)}</ul> : <p className="text-sm text-slate-500">Nothing here.</p>}
        <p className="mt-6 text-sm text-slate-500">Stuck on a solution? <Link to="/" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">Ask the AI tutor</Link> to explain it step by step.</p>
      </div>
    </>
  );
}
