import type { ExamDifficulty } from "./types";

const NEXT_LABEL: Record<string, string> = { foundation: "JEE Main", jee_main: "Advanced" };

/** How the student moves between levels, in one sentence. */
export function levelRule(difficulty: ExamDifficulty) {
  const up = difficulty.promote_at !== null ? `Score ${difficulty.promote_at}%+ accuracy (attempting at least half the paper) to move up to ${NEXT_LABEL[difficulty.level]}.` : "This is the top level.";
  const down = difficulty.demote_below !== null ? ` Below ${difficulty.demote_below}% you move down a level.` : "";
  return up + down;
}
