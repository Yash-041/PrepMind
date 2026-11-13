import { useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExamSetup } from "@/components/exam/ExamSetup";
import { ExamRunner } from "@/components/exam/ExamRunner";
import { ExamResultView } from "@/components/exam/ExamResultView";
import { api, ApiError } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { ExamAttempt } from "@/lib/types";

function CenteredCard({ children }: { children: ReactNode }) {
  return <div className="flex h-full items-center justify-center overflow-y-auto p-5"><div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">{children}</div></div>;
}

function Preparing({ attempt, onCancel }: { attempt: ExamAttempt; onCancel: () => void }) {
  const pct = attempt.prep_total ? Math.round((attempt.prep_ready / attempt.prep_total) * 100) : 0;
  return (
    <CenteredCard>
      <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"><Sparkles size={22} /></div>
      <h1 className="mt-5 font-heading text-2xl font-semibold tracking-tight" data-testid="exam-preparing-heading">Preparing your paper</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">Writing questions from your NCERT chapters. A second model checks every answer key. The 180-minute timer starts only when the paper is ready.</p>
      <div className="mt-6 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-indigo-600 transition-[width] duration-700" style={{ width: `${pct}%` }} data-testid="exam-preparing-bar" /></div>
      <p className="mt-2 text-sm font-semibold tabular-nums" data-testid="exam-preparing-count">{attempt.prep_ready} / {attempt.prep_total} questions ready</p>
      <p className="mt-4 text-xs text-slate-400">You can leave this page. Preparation continues and the paper waits for you under Exam Simulator.</p>
      <button onClick={onCancel} className="mt-5 text-sm font-semibold text-slate-500 hover:text-rose-600" data-testid="exam-preparing-cancel">Cancel</button>
    </CenteredCard>
  );
}

function AttemptView({ attemptId, onExit, onOpen }: { attemptId: string; onExit: () => void; onOpen: (id: string) => void }) {
  const attempt = useQuery({
    queryKey: ["exam-attempt", attemptId],
    queryFn: () => api.getExamAttempt(attemptId),
    refetchInterval: (query) => (query.state.data?.status === "preparing" ? 3000 : false),
  });
  const submitted = attempt.data?.status === "submitted";
  const result = useQuery({ queryKey: ["exam-result", attemptId], queryFn: () => api.getExamResult(attemptId), enabled: submitted });
  const [busy, setBusy] = useState(false);

  const refreshLists = () => {
    void queryClient.invalidateQueries({ queryKey: ["exam-history"] });
    void queryClient.invalidateQueries({ queryKey: ["exam-bank-status"] });
  };
  const exit = () => { refreshLists(); onExit(); };
  const discard = async (thenRetry: boolean) => {
    setBusy(true);
    try {
      await api.discardExamAttempt(attemptId);
      refreshLists();
      if (thenRetry) onOpen((await api.startExamAttempt()).id);
      else onExit();
    } finally {
      setBusy(false);
    }
  };

  if (attempt.isLoading || (submitted && result.isLoading)) {
    return <div className="flex h-full items-center justify-center text-slate-500"><LoaderCircle className="animate-spin" /></div>;
  }
  if (attempt.error || result.error || !attempt.data) {
    const err = attempt.error ?? result.error;
    return (
      <CenteredCard>
        <AlertTriangle size={30} className="mx-auto text-rose-500" />
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">{err instanceof ApiError ? err.message : "Couldn't load this paper."}</p>
        <Button onClick={exit} variant="outline" className="mt-5">Back to mock tests</Button>
      </CenteredCard>
    );
  }

  const data = attempt.data;
  if (data.status === "preparing") return <Preparing attempt={data} onCancel={() => void discard(false)} />;
  if (data.status === "failed") {
    return (
      <CenteredCard>
        <AlertTriangle size={30} className="mx-auto text-amber-500" />
        <h1 className="mt-4 font-heading text-xl font-semibold tracking-tight">The paper couldn't be prepared</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500" data-testid="exam-failed-message">{data.prep_error}</p>
        <p className="mt-2 text-xs text-slate-400">Questions already written stay in the bank, so a retry continues from there.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void discard(false)}>Back</Button>
          <Button disabled={busy} onClick={() => void discard(true)} className="bg-indigo-600 hover:bg-indigo-700" data-testid="exam-retry-button">Try again</Button>
        </div>
      </CenteredCard>
    );
  }
  if (data.status === "in_progress") {
    return <ExamRunner key={data.id} attempt={data} onSubmitted={() => { refreshLists(); void queryClient.invalidateQueries({ queryKey: ["exam-attempt", attemptId] }); }} />;
  }
  return result.data ? <ExamResultView result={result.data} onBack={exit} /> : null;
}

export default function ExamSimulator() {
  const [params, setParams] = useSearchParams();
  const attemptId = params.get("attempt");
  const open = (id: string) => setParams({ attempt: id });
  if (!attemptId) return <ExamSetup onOpen={open} />;
  return <AttemptView key={attemptId} attemptId={attemptId} onOpen={open} onExit={() => setParams({})} />;
}
