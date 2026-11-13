import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowUpRight, BrainCircuit, CalendarCheck, CheckCircle2, ChevronRight, Clock3, Flame, LoaderCircle, Target, TrendingUp, Trophy } from "lucide-react";
import { api } from "@/lib/api";
import type { ProgressActivity, ProgressReport, TopicProgress, WeakSeverity } from "@/lib/types";

const SUBJECT_COLORS: Record<string, string> = { Physics: "bg-indigo-600", Chemistry: "bg-emerald-600", Mathematics: "bg-orange-600" };
const SEVERITY_STYLES: Record<WeakSeverity, string> = {
  high: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  none: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};
const card = "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900";

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function TopicRow({ topic }: { topic: TopicProgress }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{topic.topic}</p>
        <p className="text-xs text-slate-500">{topic.subject} · {topic.correct}/{topic.attempted} correct</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {topic.weak_severity !== "none" && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${SEVERITY_STYLES[topic.weak_severity]}`}>{topic.weak_severity}</span>
        )}
        <span className="w-12 text-right text-sm font-semibold tabular-nums">{Math.round(topic.accuracy)}%</span>
      </div>
    </li>
  );
}

function ActivityRow({ item }: { item: ProgressActivity }) {
  const to = item.kind === "exam" ? `/exam?attempt=${item.id}` : "/daily";
  const Icon = item.kind === "exam" ? Target : CalendarCheck;
  return (
    <li>
      <Link to={to} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60" data-testid={`progress-activity-${item.id}`}>
        <div className="flex min-w-0 items-center gap-3">
          <Icon size={16} className="shrink-0 text-indigo-500" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{item.title}</p>
            <p className="text-xs text-slate-500">{formatDate(item.submitted_at)}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-right">
          <div>
            <p className="text-sm font-semibold tabular-nums">{item.kind === "daily" ? `${item.correct}/${item.total} right` : `${item.score}/${item.max_score}`}</p>
            <p className="text-xs text-slate-500">{Math.round(item.accuracy)}% accuracy</p>
          </div>
          <ChevronRight size={15} className="text-slate-400" />
        </div>
      </Link>
    </li>
  );
}

function Recommendation({ report }: { report: ProgressReport }) {
  const focus = report.weak_topics[0];
  const empty = report.stats.questions_attempted === 0;
  const title = empty ? "Start with today's Daily 20." : focus ? `Strengthen ${focus.topic}.` : "Test yourself under exam conditions.";
  const body = empty
    ? "Your report fills in as you practise. Each answer updates your accuracy by subject and topic."
    : focus
      ? `You're at ${Math.round(focus.accuracy)}% in ${focus.subject} · ${focus.topic} (${focus.correct}/${focus.attempted}). Revise it with the AI tutor, then practise it again in your Daily 20.`
      : "No weak topics right now. A full mock exam will show how well that holds up against the clock.";
  const [label, to] = !empty && !focus ? ["Open Exam Simulator", "/exam"] : ["Open Daily 20", "/daily"];
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-6 dark:border-amber-500/20 dark:bg-amber-500/10">
      <p className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">Next recommendation</p>
      <h2 className="mt-3 font-heading text-xl font-semibold tracking-tight text-amber-950 dark:text-amber-100">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-amber-900/70 dark:text-amber-100/70">{body}</p>
      <div className="mt-5 flex flex-wrap gap-4">
        <Link to={to} className="inline-flex items-center gap-2 text-sm font-semibold text-amber-800 hover:underline dark:text-amber-200" data-testid="progress-recommendation-button">{label} <ArrowUpRight size={15} /></Link>
        {focus && <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-amber-800 hover:underline dark:text-amber-200">Ask AI tutor <ArrowUpRight size={15} /></Link>}
      </div>
    </div>
  );
}

export default function Progress() {
  const { data: report, isPending, isError, refetch } = useQuery({ queryKey: ["progress-report"], queryFn: api.getProgressReport });

  const header = (
    <div className="mb-8">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600 dark:text-indigo-400">Your momentum</p>
      <h1 className="mt-2 font-heading text-4xl font-semibold tracking-tight" data-testid="progress-heading">Progress</h1>
      <p className="mt-3 text-sm text-slate-500">Built from every Daily 20 set and mock exam you submit.</p>
    </div>
  );

  if (isPending || isError) {
    return (
      <div className="h-full overflow-y-auto"><div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        {header}
        <div className={`${card} flex items-center justify-center gap-3 py-16 text-sm text-slate-500`}>
          {isPending ? <><LoaderCircle size={18} className="animate-spin" /> Loading your progress…</> : <>Couldn't load your progress. <button onClick={() => void refetch()} className="font-semibold text-indigo-600 hover:underline">Try again</button></>}
        </div>
      </div></div>
    );
  }

  const { stats } = report;
  const statTiles = [
    { label: "Questions solved", value: String(stats.questions_attempted), hint: `${stats.questions_correct} correct`, Icon: CheckCircle2 },
    { label: "Average accuracy", value: stats.questions_attempted ? `${Math.round(stats.accuracy)}%` : "—", hint: "Across all attempts", Icon: TrendingUp },
    { label: "Mock exams", value: String(stats.exams_completed), hint: `${stats.daily_sets_completed} Daily 20 sets`, Icon: Target },
    { label: "Exam time", value: formatMinutes(stats.exam_minutes), hint: `${stats.current_streak}-day streak`, Icon: stats.current_streak ? Flame : Clock3 },
  ];

  return (
    <div className="h-full overflow-y-auto"><div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      {header}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statTiles.map(({ label, value, hint, Icon }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" data-testid={`progress-stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
            <Icon size={17} className="text-indigo-500" />
            <p className="mt-4 text-xs text-slate-500">{label}</p>
            <p className="mt-1 font-heading text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
            <p className="mt-0.5 text-xs text-slate-400">{hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <div className={card}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-heading text-lg font-semibold tracking-tight">Subject performance</h2>
              <p className="mt-1 text-xs text-slate-500">Across Daily 20 and mock exams</p>
            </div>
            <BrainCircuit size={19} className="text-indigo-500" />
          </div>
          <div className="mt-6 space-y-5">
            {report.subjects.map((s) => (
              <div key={s.subject}>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="font-semibold">{s.subject}</span>
                  <span className="text-slate-500">
                    {s.attempted ? <>{Math.round(s.accuracy)}% · {s.correct}/{s.attempted}{s.weak_count > 0 && <> · {s.weak_count} weak</>}</> : "Not attempted yet"}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className={`h-full rounded-full ${SUBJECT_COLORS[s.subject] ?? "bg-indigo-600"}`} style={{ width: `${s.accuracy}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <Recommendation report={report} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className={card}>
          <h2 className="font-heading text-lg font-semibold tracking-tight">Topics to work on</h2>
          <p className="mt-1 text-xs text-slate-500">Lowest accuracy first</p>
          {report.weak_topics.length ? (
            <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">{report.weak_topics.map((t) => <TopicRow key={`${t.subject}-${t.topic}`} topic={t} />)}</ul>
          ) : (
            <p className="mt-6 text-sm text-slate-500">{stats.questions_attempted ? "No weak topics. Keep it up." : "Weak topics show up here once you've answered some questions."}</p>
          )}
          {report.strong_topics.length > 0 && (
            <>
              <h3 className="mt-6 flex items-center gap-2 text-sm font-semibold"><Trophy size={15} className="text-emerald-600" /> Strongest topics</h3>
              <ul className="mt-1 divide-y divide-slate-100 dark:divide-slate-800">{report.strong_topics.map((t) => <TopicRow key={`${t.subject}-${t.topic}`} topic={t} />)}</ul>
            </>
          )}
        </div>

        <div className={card}>
          <h2 className="font-heading text-lg font-semibold tracking-tight">Recent activity</h2>
          <p className="mt-1 text-xs text-slate-500">Your latest submitted sets and exams</p>
          {report.recent_activity.length ? (
            <ul className="-mx-3 mt-3">{report.recent_activity.map((item) => <ActivityRow key={`${item.kind}-${item.id}`} item={item} />)}</ul>
          ) : (
            <p className="mt-6 text-sm text-slate-500">Nothing submitted yet. Finish a Daily 20 or a mock exam to see it here.</p>
          )}
        </div>
      </div>
    </div></div>
  );
}
