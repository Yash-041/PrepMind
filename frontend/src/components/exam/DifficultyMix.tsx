import type { Difficulty, ExamDifficulty } from "@/lib/types";

const ORDER: Difficulty[] = ["Easy", "Medium", "Hard"];
const BAR: Record<Difficulty, string> = { Easy: "bg-emerald-500", Medium: "bg-amber-500", Hard: "bg-rose-500" };

/** Stacked Easy / Medium / Hard bar with a legend. */
export function DifficultyMix({ difficulty }: { difficulty: ExamDifficulty }) {
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full" role="img" aria-label={ORDER.map((d) => `${difficulty.mix[d]}% ${d}`).join(", ")}>
        {ORDER.map((d) => <div key={d} className={BAR[d]} style={{ width: `${difficulty.mix[d]}%` }} />)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        {ORDER.map((d) => <span key={d} className="flex items-center gap-1.5"><span className={`size-2 rounded-full ${BAR[d]}`} />{difficulty.mix[d]}% {d}</span>)}
      </div>
    </div>
  );
}
