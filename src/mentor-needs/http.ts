import type { CohortSummary } from "../lifecycle/cohort-management.ts";
import type { MentorNeedsBoardRow } from "./domain.ts";

interface CohortOptions {
  current: CohortSummary | null;
  previous: CohortSummary | null;
  all: readonly CohortSummary[];
}

export function buildMentorNeedsBoardPayload(
  options: CohortOptions,
  rows: readonly MentorNeedsBoardRow[],
  summary: { activeMentorCount: number; activeOutreachContactCount: number },
  scope: "semester" | "all",
) {
  return { cohorts: options.all, rows, summary, scope };
}
