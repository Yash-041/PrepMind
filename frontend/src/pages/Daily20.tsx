import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Clock3, LoaderCircle, Target } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { DailySet, DailyStreak } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MathText } from "@/components/MathText";
import { StreakCard } from "@/components/daily/StreakCard";
import { DailyResultView } from "@/components/daily/DailyResultView";

const SUBJECTS = ["Physics", "Chemistry", "Mathematics"] as const;
const card = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900";

// Answers live in the browser until submit, so a refresh mid-set doesn't lose them.
const draftKey = (setId: string) => `prepmind-daily-draft-${setId}`;
function loadDraft(setId: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(draftKey(setId)) ?? "{}");
  } catch {
    return {};
  }
}
function saveDraft(setId: string, answers: Record<string, string> | null) {
  try {
    if (answers) localStorage.setItem(draftKey(setId), JSON.stringify(answers));
    else localStorage.removeItem(draftKey(setId));
  } catch {
    // Storage unavailable (private mode): answers just won't survive a refresh.
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="h-full overflow-y-auto"><div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">{children}</div></div>;
}

function Header({ answered, total }: { answered?: number; total?: number }) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <div className="mb-3 flex items-center gap-2 text-indigo-600 dark:text-indigo-400"><Target size={17} /><span className="text-xs font-bold uppercase tracking-[.18em]" data-testid="daily-kicker">Daily practice</span></div>
        <h1 className="font-heading text-4xl font-semibold tracking-tight" data-testid="daily-heading">Daily 20</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400" data-testid="daily-subtitle">A new set of 20 questions every day. Submit before midnight to keep your streak.</p>
      </div>
      {total !== undefined && (
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Today</p>
          <p className="mt-1 font-heading text-lg font-semibold tabular-nums">{answered} / {total}</p>
        </div>
      )}
    </div>
  );
}

function Runner({ set, streak }: { set: DailySet; streak?: DailyStreak }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(() => loadDraft(set.id));
  const [confirming, setConfirming] = useState(false);
  const questions = set.questions;
  const question = questions[index];
  const answered = questions.filter((q) => answers[q.id]).length;
  const unanswered = questions.length - answered;

  useEffect(() => saveDraft(set.id, answers), [set.id, answers]);

  const submit = useMutation({
    mutationFn: () => api.submitDailyPractice(set.id, questions.map((q) => ({ question_id: q.id, selected_option: answers[q.id] ?? null }))),
    onSuccess: (result) => {
      saveDraft(set.id, null);
      queryClient.setQueryData(["daily-result", set.id], result);
      queryClient.setQueryData<DailySet>(["daily-today"], (old) => old && { ...old, is_submitted: true });
      void queryClient.invalidateQueries({ queryKey: ["daily-streak"] });
      void queryClient.invalidateQueries({ queryKey: ["progress-report"] });
    },
    onError: (error) => {
      // Already submitted from another tab: show that result instead.
      if (error instanceof ApiError && error.status === 409) void queryClient.invalidateQueries({ queryKey: ["daily-today"] });
    },
  });

  const choose = (option: string) => {
    setConfirming(false);
    setAnswers((current) => {
      const next = { ...current };
      if (next[question.id] === option) delete next[question.id];
      else next[question.id] = option;
      return next;
    });
  };
  const requestSubmit = () => (unanswered > 0 && !confirming ? setConfirming(true) : submit.mutate());
  const isLast = index === questions.length - 1;

  return (
    <>
      <Header answered={answered} total={questions.length} />
      <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full rounded-full bg-indigo-600 transition-[width] duration-300" style={{ width: `${(answered / questions.length) * 100}%` }} data-testid="daily-progress-bar" /></div>
      <div className="mb-6 flex justify-between text-xs text-slate-500"><span data-testid="daily-progress-label">{answered} of {questions.length} answered</span><span>See right and wrong answers after you submit</span></div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_270px]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 dark:border-slate-800 dark:bg-slate-900" data-testid="daily-question-card">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-indigo-200 text-indigo-700 dark:border-indigo-500/30 dark:text-indigo-300">Question {index + 1} / {questions.length}</Badge>
                <span className="text-xs text-slate-400">{question.topic}</span>
                {question.is_pyq && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">PYQ</span>}
              </div>
              <h2 className="font-heading text-xl font-semibold tracking-tight" data-testid="daily-question-subject">{question.subject}</h2>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${question.difficulty === "Hard" ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300" : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"}`} data-testid="daily-question-difficulty">{question.difficulty}</span>
          </div>
          <MathText text={question.question_text} className="mb-8 max-w-3xl text-[17px] leading-8 text-slate-800 dark:text-slate-100" />
          <div className="grid gap-3 sm:grid-cols-2">
            {question.options.map((option, optionIndex) => {
              const selected = answers[question.id] === option;
              return (
                <button key={optionIndex} onClick={() => choose(option)} aria-pressed={selected} data-testid={`daily-option-${optionIndex}`}
                  className={`flex min-h-14 items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-[border-color,background-color,transform] hover:-translate-y-0.5 ${selected ? "border-indigo-500 bg-indigo-50 text-indigo-800 ring-2 ring-indigo-500/15 dark:bg-indigo-500/10 dark:text-indigo-200" : "border-slate-200 bg-slate-50/60 text-slate-700 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"}`}>
                  <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${selected ? "bg-indigo-600 text-white" : "bg-white text-slate-500 dark:bg-slate-800"}`}>{String.fromCharCode(65 + optionIndex)}</span>
                  <MathText text={option} inline className="min-w-0 flex-1" />
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate-400">Click a selected option again to clear it.</p>
          <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5 dark:border-slate-800">
            <Button variant="outline" disabled={index === 0} onClick={() => setIndex((value) => value - 1)} className="gap-2" data-testid="daily-previous-button"><ArrowLeft size={15} /> Previous</Button>
            {isLast
              ? <Button onClick={requestSubmit} disabled={submit.isPending} className="gap-2 bg-indigo-600 hover:bg-indigo-700" data-testid="daily-next-button">Submit Daily 20 <ChevronRight size={15} /></Button>
              : <Button onClick={() => setIndex((value) => value + 1)} className="gap-2 bg-indigo-600 hover:bg-indigo-700" data-testid="daily-next-button">Next question <ChevronRight size={15} /></Button>}
          </div>
        </section>

        <aside className="space-y-4">
          {streak && <StreakCard streak={streak} />}
          <div className={card}>
            <div className="mb-3 flex items-center gap-2"><Clock3 size={16} className="text-indigo-500" /><h3 className="text-sm font-semibold">Questions</h3></div>
            <div className="grid grid-cols-5 gap-1.5">
              {questions.map((q, i) => (
                <button key={q.id} onClick={() => setIndex(i)} aria-label={`Question ${i + 1}`} data-testid={`daily-palette-${i + 1}`}
                  className={`h-8 rounded-lg text-xs font-semibold tabular-nums ${i === index ? "ring-2 ring-indigo-500" : ""} ${answers[q.id] ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>
                  {i + 1}
                </button>
              ))}
            </div>
            <div className="mt-4 space-y-1.5 text-xs">
              {SUBJECTS.map((subject) => {
                const items = questions.filter((q) => q.subject === subject);
                return items.length ? <div key={subject} className="flex justify-between"><span className="text-slate-500">{subject}</span><span className="font-semibold tabular-nums">{items.filter((q) => answers[q.id]).length} / {items.length}</span></div> : null;
              })}
            </div>
            {confirming && (
              <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200" data-testid="daily-submit-confirm">
                {unanswered} {unanswered === 1 ? "question is" : "questions are"} still unanswered. Press submit again to confirm.
              </p>
            )}
            {submit.isError && <p className="mt-4 text-xs text-rose-600">{submit.error.message}</p>}
            <Button onClick={requestSubmit} disabled={submit.isPending} className="mt-4 w-full gap-2 bg-indigo-600 hover:bg-indigo-700" data-testid="daily-submit-button">
              {submit.isPending ? <><LoaderCircle size={15} className="animate-spin" /> Submitting…</> : confirming ? "Submit anyway" : "Submit Daily 20"}
            </Button>
          </div>
        </aside>
      </div>
    </>
  );
}

function Submitted({ set, streak }: { set: DailySet; streak?: DailyStreak }) {
  const result = useQuery({ queryKey: ["daily-result", set.id], queryFn: () => api.getDailyResult(set.id) });
  if (!result.data) {
    return <><Header /><div className={`${card} flex items-center justify-center gap-3 py-16 text-sm text-slate-500`}>{result.isError ? "Couldn't load your result." : <><LoaderCircle size={18} className="animate-spin" /> Loading your result…</>}</div></>;
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_270px]">
      <div className="min-w-0"><DailyResultView result={result.data} streak={streak} /></div>
      <aside>{streak && <StreakCard streak={streak} />}</aside>
    </div>
  );
}

export default function Daily20() {
  const today = useQuery({ queryKey: ["daily-today"], queryFn: () => api.getTodayPractice() });
  const streak = useQuery({ queryKey: ["daily-streak"], queryFn: api.getDailyStreak });
  const set = today.data;

  // Past midnight the server hands out a new set; refetch when the tab is reopened on a new day.
  useEffect(() => {
    if (!streak.data) return;
    const ms = new Date(streak.data.next_reset_at).getTime() - Date.now();
    const timer = window.setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: ["daily-today"] });
      void queryClient.invalidateQueries({ queryKey: ["daily-streak"] });
    }, Math.max(1000, ms + 1000));
    return () => window.clearTimeout(timer);
  }, [streak.data]);

  if (!set) {
    return (
      <Shell>
        <Header />
        <div className={`${card} flex items-center justify-center gap-3 py-16 text-sm text-slate-500`}>
          {today.isError
            ? <>Couldn't load today's set. <button onClick={() => void today.refetch()} className="font-semibold text-indigo-600 hover:underline">Try again</button></>
            : <><LoaderCircle size={18} className="animate-spin" /> Preparing today's 20 questions…</>}
        </div>
      </Shell>
    );
  }
  if (!set.questions.length) {
    return <Shell><Header /><div className={`${card} py-16 text-center text-sm text-slate-500`}>The question bank is empty right now. Check back once questions have been generated.</div></Shell>;
  }
  return <Shell>{set.is_submitted ? <Submitted set={set} streak={streak.data} /> : <Runner key={set.id} set={set} streak={streak.data} />}</Shell>;
}
