export type MeetingFormat = "in_person" | "remote" | "hybrid";

export interface AssignmentSlot {
  id: string;
  semesterId: string;
  date: string;
  start: string;
  end: string;
  format: MeetingFormat;
}

export interface MentorCandidate {
  id: string;
  name: string;
  expertise: readonly string[];
  /** Slot IDs (or date strings) for which this mentor is available. */
  availability: readonly string[];
  recentMeetingCount: number;
  assignmentLoad: number;
  formats: readonly MeetingFormat[];
}

export interface RankingInput {
  primaryNeed: string | null;
  secondaryNeed: string | null;
  supplementalNeeds?: readonly string[];
  slot: AssignmentSlot;
  mentors: readonly MentorCandidate[];
  excludeMentorIds?: readonly string[];
}

export interface RankedMentor {
  mentor: MentorCandidate;
  score: number;
  eligible: boolean;
  reasons: string[];
  exclusionReason?: string;
}

const same = (a: string | null, b: string): boolean => a !== null && a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

export function rankMentorCandidates(input: RankingInput): RankedMentor[] {
  const excluded = new Set(input.excludeMentorIds ?? []);
  return input.mentors.map((mentor): RankedMentor => {
    const primary = mentor.expertise.some((tag) => same(input.primaryNeed, tag));
    const secondary = mentor.expertise.some((tag) => same(input.secondaryNeed, tag));
    const supplemental = mentor.expertise.some((tag) => (
      (input.supplementalNeeds ?? []).some((need) => same(need, tag))
    ));
    const available = mentor.availability.includes(input.slot.id) || mentor.availability.includes(input.slot.date);
    const formatFit = mentor.formats.includes(input.slot.format);
    const secondSlotExcluded = excluded.has(mentor.id);
    let score = primary ? 100 : secondary ? 60 : supplemental ? 20 : 0;
    score += available ? 25 : -50;
    score += formatFit ? 10 : -10;
    score -= mentor.recentMeetingCount * 8;
    score -= mentor.assignmentLoad * 2;
    const reasons: string[] = [];
    if (primary) reasons.push("primary expertise match");
    else if (secondary) reasons.push("secondary expertise match");
    else if (supplemental) reasons.push("preferred expertise match");
    if (available) reasons.push("available");
    else reasons.push("unavailable for selected slot");
    if (formatFit) reasons.push("format fit");
    if (mentor.recentMeetingCount > 0) reasons.push("recent meeting penalty");
    if (mentor.assignmentLoad > 0) reasons.push("workload tie-break");
    if (secondSlotExcluded) reasons.push("excluded from second slot");
    const exclusionReason = secondSlotExcluded
      ? "Mentor already assigned to the first slot; excluded from second slot."
      : !available
        ? "Mentor unavailable for selected slot."
        : undefined;
    return {
      mentor,
      score,
      eligible: available && !secondSlotExcluded,
      reasons,
      ...(exclusionReason ? { exclusionReason } : {}),
    };
  }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score || a.mentor.id.localeCompare(b.mentor.id));
}
