import { useEffect, useState } from "react";
import { Flame, Trophy } from "lucide-react";
import type { DailyStreak } from "@/lib/types";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** "4h 12m" until `iso`; re-renders every 30s. */
function useCountdown(iso: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  if (!iso) return "";
  const minutes = Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

export function StreakCard({ streak }: { streak: DailyStreak }) {
  const countdown = useCountdown(streak.next_reset_at);
  // Pad the front so the calendar's columns line up with weekdays (Monday first).
  const firstWeekday = (new Date(`${streak.calendar[0].date}T00:00:00`).getDay() + 6) % 7;
  const atRisk = !streak.solved_today && streak.current_streak > 0;
  // The four weeks often span two months: "Sep – Oct 2026".
  const monthOf = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, opts);
  const first = streak.calendar[0].date;
  const last = streak.calendar[streak.calendar.length - 1].date;
  const monthRange = first.slice(0, 7) === last.slice(0, 7)
    ? monthOf(last, { month: "long", year: "numeric" })
    : `${monthOf(first, { month: "short" })} – ${monthOf(last, { month: "short", year: "numeric" })}`;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900" data-testid="daily-streak-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current streak</p>
          <p className="mt-1 flex items-center gap-2 font-heading text-3xl font-semibold tracking-tight tabular-nums" data-testid="daily-streak-current">
            <Flame size={24} className={streak.solved_today ? "fill-orange-500 text-orange-500" : "text-slate-300 dark:text-slate-600"} />
            {streak.current_streak}
            <span className="text-sm font-medium text-slate-500">{streak.current_streak === 1 ? "day" : "days"}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="flex items-center justify-end gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400"><Trophy size={11} /> Best</p>
          <p className="mt-1 font-heading text-lg font-semibold tabular-nums">{streak.longest_streak}</p>
        </div>
      </div>

      <p className={`mt-3 text-xs leading-5 ${atRisk ? "font-semibold text-orange-600 dark:text-orange-400" : "text-slate-500"}`}>
        {streak.solved_today
          ? `Done for today. Next set in ${countdown}.`
          : atRisk
            ? `Submit today's set within ${countdown} to keep your streak.`
            : `Submit today's set to start a streak. ${countdown} left.`}
      </p>

      <p className="mt-4 text-xs font-semibold text-slate-600 dark:text-slate-300">{monthRange}</p>
      <div className="mt-2 grid grid-cols-7 gap-1.5" aria-label="Last four weeks">
        {WEEKDAYS.map((d, i) => <span key={i} className="text-center text-[10px] font-semibold text-slate-400">{d}</span>)}
        {Array.from({ length: firstWeekday }, (_, i) => <span key={`pad-${i}`} />)}
        {streak.calendar.map((day) => {
          const isToday = day.date === streak.today;
          const date = new Date(`${day.date}T00:00:00`);
          const label = date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
          return (
            <span
              key={day.date}
              title={day.solved ? `${label}: solved (${Math.round(day.accuracy ?? 0)}% accuracy)` : `${label}: not solved`}
              aria-label={day.solved ? `${label}, solved` : `${label}, not solved`}
              className={`flex aspect-square items-center justify-center rounded-md text-[11px] font-semibold tabular-nums ${day.solved ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"} ${isToday ? "ring-2 ring-indigo-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-900" : ""}`}
            >
              {date.getDate()}
            </span>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-orange-500" /> Solved</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm ring-2 ring-indigo-500" /> Today</span>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">{streak.total_days_solved} {streak.total_days_solved === 1 ? "day" : "days"} solved in total</p>
    </div>
  );
}
