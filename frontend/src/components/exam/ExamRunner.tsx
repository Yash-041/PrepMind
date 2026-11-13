import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Bookmark, Check, CloudOff, Clock3, Eraser, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MathText } from "@/components/MathText";
import { api, ApiError } from "@/lib/api";
import type { ExamAttempt, ExamQuestion, ExamSubject } from "@/lib/types";

type QuestionState = "not_visited" | "not_answered" | "answered" | "marked" | "answered_marked";

const STATE_STYLES: Record<QuestionState, string> = {
  not_visited: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  not_answered: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  answered: "bg-emerald-500 text-white",
  marked: "bg-violet-500 text-white",
  answered_marked: "bg-violet-500 text-white ring-2 ring-emerald-400 ring-inset",
};
const STATE_LABELS: Record<QuestionState, string> = {
  answered: "Answered",
  not_answered: "Not answered",
  not_visited: "Not visited",
  marked: "Marked for review",
  answered_marked: "Answered & marked (will be evaluated)",
};
const NUMBER_INPUT = /^-?\d*\.?\d{0,4}$/;

function formatClock(seconds: number) {
  const s = Math.max(0, seconds);
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");
}

export function ExamRunner({ attempt, onSubmitted }: { attempt: ExamAttempt; onSubmitted: () => void }) {
  const questions = attempt.questions;
  const subjects = useMemo(() => [...new Set(questions.map((q) => q.subject))] as ExamSubject[], [questions]);

  const [index, setIndex] = useState(() => Math.max(0, questions.findIndex((q) => !q.selected_option)));
  const [answers, setAnswers] = useState<Record<string, string | null>>(() => Object.fromEntries(questions.map((q) => [q.id, q.selected_option])));
  const [marked, setMarked] = useState<Record<string, boolean>>(() => Object.fromEntries(questions.map((q) => [q.id, q.marked_for_review])));
  const [visited, setVisited] = useState<Set<string>>(() => new Set(questions.filter((q) => q.selected_option || q.marked_for_review || q.time_spent_seconds > 0).map((q) => q.id)));
  const times = useRef<Record<string, number>>(Object.fromEntries(questions.map((q) => [q.id, q.time_spent_seconds])));
  const enteredAt = useRef(Date.now());
  const dirty = useRef(new Set<string>());
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [secondsLeft, setSecondsLeft] = useState(attempt.remaining_seconds);
  const deadline = useRef(Date.now() + attempt.remaining_seconds * 1000);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const submittedRef = useRef(false);

  const question = questions[index];

  const stateOf = useCallback((q: ExamQuestion): QuestionState => {
    const answered = !!answers[q.id];
    if (marked[q.id]) return answered ? "answered_marked" : "marked";
    if (answered) return "answered";
    return visited.has(q.id) ? "not_answered" : "not_visited";
  }, [answers, marked, visited]);

  // ---- saving ----
  const commitTime = useCallback(() => {
    const id = questions[index]?.id;
    if (!id) return;
    const elapsed = Math.round((Date.now() - enteredAt.current) / 1000);
    enteredAt.current = Date.now();
    if (elapsed > 0) {
      times.current[id] = (times.current[id] ?? 0) + elapsed;
      dirty.current.add(id);
    }
  }, [index, questions]);

  const latest = useRef({ answers, marked });
  latest.current = { answers, marked };

  const flush = useCallback(async () => {
    if (dirty.current.size === 0 || submittedRef.current) return true;
    const ids = [...dirty.current];
    dirty.current.clear();
    setSaveState("saving");
    try {
      await api.saveExamAnswers(attempt.id, ids.map((id) => ({
        attempt_question_id: id,
        selected_option: latest.current.answers[id] || null,
        marked_for_review: !!latest.current.marked[id],
        time_spent_seconds: times.current[id] ?? 0,
      })));
      setSaveState("saved");
      return true;
    } catch (err) {
      ids.forEach((id) => dirty.current.add(id));
      setSaveState("error");
      // 409: time ran out and the server auto-submitted.
      if (err instanceof ApiError && err.status === 409) onSubmitted();
      return false;
    }
  }, [attempt.id, onSubmitted]);

  useEffect(() => {
    const timer = window.setInterval(() => { void flush(); }, 2500);
    return () => window.clearInterval(timer);
  }, [flush]);

  // ---- navigation ----
  useEffect(() => {
    const id = questions[index]?.id;
    if (id) setVisited((v) => (v.has(id) ? v : new Set(v).add(id)));
  }, [index, questions]);

  const goTo = (next: number) => {
    if (next < 0 || next >= questions.length || next === index) return;
    commitTime();
    setIndex(next);
  };

  const setAnswer = (value: string | null) => {
    setAnswers((a) => ({ ...a, [question.id]: value }));
    dirty.current.add(question.id);
  };
  const toggleMark = () => {
    setMarked((m) => ({ ...m, [question.id]: !m[question.id] }));
    dirty.current.add(question.id);
  };
  const openSubmit = () => {
    commitTime();
    setConfirmOpen(true);
  };
  const markAndNext = () => {
    setMarked((m) => ({ ...m, [question.id]: true }));
    dirty.current.add(question.id);
    goTo(index + 1);
  };

  // ---- submit ----
  const submit = useCallback(async () => {
    if (submittedRef.current) return;
    setSubmitting(true);
    setSubmitError("");
    commitTime();
    await flush();
    submittedRef.current = true;
    try {
      await api.submitExamAttempt(attempt.id);
      onSubmitted();
    } catch (err) {
      submittedRef.current = false;
      setSubmitting(false);
      setSubmitError(err instanceof ApiError ? err.message : "Couldn't reach the server. Your answers are saved. Try submitting again.");
    }
  }, [attempt.id, commitTime, flush, onSubmitted]);

  // ---- timer (the server holds the real deadline) ----
  useEffect(() => {
    const timer = window.setInterval(() => {
      const left = Math.round((deadline.current - Date.now()) / 1000);
      setSecondsLeft(left);
      if (left <= 0) {
        window.clearInterval(timer);
        void submit();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [submit]);

  const counts = useMemo(() => {
    const c: Record<QuestionState, number> = { answered: 0, not_answered: 0, not_visited: 0, marked: 0, answered_marked: 0 };
    questions.forEach((q) => { c[stateOf(q)] += 1; });
    return c;
  }, [questions, stateOf]);

  const subjectQuestions = questions.filter((q) => q.subject === question.subject);
  const numberInSubject = subjectQuestions.indexOf(question) + 1;
  const isNumerical = question.question_type === "numerical";
  const lowTime = secondsLeft < 300;

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50 dark:bg-slate-950" data-testid="exam-running">
      <div className="shrink-0 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-indigo-600 dark:text-indigo-400">PrepMind AI</p>
            <h1 className="mt-0.5 truncate text-sm font-semibold">{attempt.title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 text-xs text-slate-400 sm:flex" data-testid="exam-save-state">
              {saveState === "saving" ? <><LoaderCircle size={13} className="animate-spin" /> Saving</> : saveState === "error" ? <><CloudOff size={13} className="text-rose-500" /> Not saved, retrying</> : <><Check size={13} /> Saved</>}
            </span>
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 font-mono text-sm font-semibold tabular-nums ${lowTime ? "border-rose-300 bg-rose-50 text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/10" : "border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200"}`} data-testid="exam-timer" aria-label="Time left">
              <Clock3 size={15} /> {formatClock(secondsLeft)}
            </div>
            <Button onClick={openSubmit} size="sm" className="bg-indigo-600 hover:bg-indigo-700" data-testid="exam-submit-top-button">Submit</Button>
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto px-3" role="tablist">
          {subjects.map((subject) => {
            const qs = questions.filter((q) => q.subject === subject);
            const done = qs.filter((q) => answers[q.id]).length;
            const active = subject === question.subject;
            return (
              <button key={subject} role="tab" aria-selected={active} onClick={() => goTo(questions.indexOf(qs[0]))} className={`shrink-0 border-b-2 px-3 pb-2 pt-1 text-sm font-semibold ${active ? "border-indigo-600 text-indigo-700 dark:text-indigo-300" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`} data-testid={`exam-subject-tab-${subject.toLowerCase()}`}>
                {subject} <span className="ml-1 text-xs font-normal text-slate-400">{done}/{qs.length}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-6xl gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_290px]">
          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-500">{question.subject} · {isNumerical ? "Section B: Numerical" : "Section A: Single correct"}</p>
                <h2 className="mt-1.5 font-heading text-xl font-semibold tracking-tight" data-testid="exam-question-number">Question {numberInSubject} <span className="text-sm font-normal text-slate-400">({question.order_index} of {questions.length})</span></h2>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">+{question.marks} / −{question.negative_marks}</span>
            </div>

            <MathText text={question.question_text} className="text-[15px] leading-7 text-slate-800 dark:text-slate-100" />

            {isNumerical ? (
              <div className="mt-7 max-w-xs">
                <label className="text-xs font-semibold text-slate-500" htmlFor="numerical-answer">Your answer (a number)</label>
                <input
                  id="numerical-answer"
                  inputMode="decimal"
                  autoComplete="off"
                  value={answers[question.id] ?? ""}
                  onChange={(e) => { if (NUMBER_INPUT.test(e.target.value)) setAnswer(e.target.value || null); }}
                  placeholder="e.g. 42"
                  className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 font-mono text-lg outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950"
                  data-testid="exam-numerical-input"
                />
              </div>
            ) : (
              <div className="mt-7 grid gap-3">
                {question.options.map((option, i) => {
                  const selected = answers[question.id] === option;
                  return (
                    <button key={i} onClick={() => setAnswer(option)} aria-pressed={selected} className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${selected ? "border-indigo-500 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-500/15 dark:bg-indigo-500/10 dark:text-indigo-100" : "border-slate-200 bg-slate-50/60 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-950"}`} data-testid={`exam-option-${i}`}>
                      <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${selected ? "bg-indigo-600 text-white" : "bg-white text-slate-500 dark:bg-slate-800"}`}>{String.fromCharCode(65 + i)}</span>
                      <MathText text={option} inline className="min-w-0 flex-1" />
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-5 dark:border-slate-800">
              <Button variant="outline" disabled={index === 0} onClick={() => goTo(index - 1)} className="gap-1.5" data-testid="exam-previous-button"><ArrowLeft size={15} /> Previous</Button>
              <Button variant="outline" onClick={() => setAnswer(null)} disabled={!answers[question.id]} className="gap-1.5" data-testid="exam-clear-button"><Eraser size={15} /> Clear</Button>
              <Button variant="outline" onClick={index === questions.length - 1 ? toggleMark : markAndNext} className={`gap-1.5 ${marked[question.id] ? "border-violet-300 text-violet-700 dark:text-violet-300" : ""}`} data-testid="exam-mark-button"><Bookmark size={15} /> {index === questions.length - 1 ? (marked[question.id] ? "Unmark" : "Mark for review") : "Mark & next"}</Button>
              <Button onClick={() => (index === questions.length - 1 ? openSubmit() : goTo(index + 1))} className="ml-auto gap-1.5 bg-indigo-600 hover:bg-indigo-700" data-testid="exam-next-button">{index === questions.length - 1 ? "Review & submit" : "Save & next"} <ArrowRight size={15} /></Button>
            </div>
          </section>

          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">{question.subject}</h2><span className="text-xs text-slate-400">{subjectQuestions.filter((q) => answers[q.id]).length}/{subjectQuestions.length} answered</span></div>
            {(["mcq", "numerical"] as const).map((kind) => {
              const group = subjectQuestions.filter((q) => q.question_type === kind);
              if (!group.length) return null;
              return (
                <div key={kind} className="mb-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{kind === "mcq" ? "Section A" : "Section B"}</p>
                  <div className="grid grid-cols-5 gap-2">
                    {group.map((q) => {
                      const n = subjectQuestions.indexOf(q) + 1;
                      return <button key={q.id} onClick={() => goTo(questions.indexOf(q))} className={`flex size-9 items-center justify-center rounded-lg text-xs font-semibold ${STATE_STYLES[stateOf(q)]} ${q.id === question.id ? "outline-2 outline-offset-2 outline-indigo-500" : ""}`} aria-label={`Question ${n}: ${STATE_LABELS[stateOf(q)]}`} data-testid={`exam-palette-${q.order_index}`}>{n}</button>;
                    })}
                  </div>
                </div>
              );
            })}
            <div className="space-y-1.5 border-t border-slate-100 pt-4 text-xs text-slate-500 dark:border-slate-800">
              {(Object.keys(STATE_LABELS) as QuestionState[]).map((s) => <p key={s} className="flex items-center gap-2"><span className={`inline-block size-3.5 shrink-0 rounded ${STATE_STYLES[s]}`} />{STATE_LABELS[s]} <span className="ml-auto font-semibold text-slate-700 dark:text-slate-300">{counts[s]}</span></p>)}
            </div>
          </aside>
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900" role="dialog" aria-modal="true" data-testid="exam-submit-dialog">
            <h2 className="font-heading text-xl font-semibold tracking-tight">Submit the paper?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">You won't be able to change answers afterwards. Marked questions that have an answer are evaluated.</p>
            <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 text-sm dark:border-slate-700">
              <div className="grid grid-cols-4 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:bg-slate-800"><span>Subject</span><span className="text-center">Answered</span><span className="text-center">Unanswered</span><span className="text-center">Marked</span></div>
              {subjects.map((subject) => {
                const qs = questions.filter((q) => q.subject === subject);
                const answered = qs.filter((q) => answers[q.id]).length;
                return <div key={subject} className="grid grid-cols-4 border-t border-slate-100 px-3 py-2 dark:border-slate-800"><span className="font-semibold">{subject}</span><span className="text-center text-emerald-600">{answered}</span><span className="text-center text-slate-500">{qs.length - answered}</span><span className="text-center text-violet-600">{qs.filter((q) => marked[q.id]).length}</span></div>;
              })}
            </div>
            {submitError && <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300" role="alert">{submitError}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting} data-testid="exam-continue-button">Keep working</Button>
              <Button onClick={submit} disabled={submitting} className="gap-2 bg-indigo-600 hover:bg-indigo-700" data-testid="exam-confirm-submit-button">{submitting && <LoaderCircle size={15} className="animate-spin" />} Submit paper</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
