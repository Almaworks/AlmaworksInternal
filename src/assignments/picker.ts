export type PickerFormat = "online" | "in_person" | "hybrid";
export type PickerTimeSlot = "3:30-4:15" | "4:15-5:00";
export type PickerOverrideType = "availability" | "capacity" | "expertise" | "second_slot";

export interface PickerCandidate {
  mentor: {
    id: string;
    name: string;
    expertise: string[];
    availability: string[];
    recentMeetingCount: number;
    assignmentLoad: number;
    formats: Array<"in_person" | "remote" | "hybrid">;
  };
  score: number;
  eligible: boolean;
  rankingEligible: boolean;
  hardConflict: boolean;
  hardConflictTypes: string[];
  requiredOverrideTypes: PickerOverrideType[];
  requiresOverrideReason: boolean;
  reasons: string[];
  explanations: string[];
  exclusionReason?: string;
}

export interface PickerCommitPayload {
  semesterId: string;
  startupSemesterId: string;
  sessionDateId: string;
  timeSlot: PickerTimeSlot;
  mentorProfileId: string;
  format: PickerFormat;
  topic: string | null;
  overrideTypes: PickerOverrideType[];
  overrideReason: string | null;
  rankingContext: {
    rank: number;
    score: number;
    reasons: string[];
    explanations: string[];
    rankingEligible: boolean;
    search: string;
    expertiseFilter: string;
  };
}

const normalized = (value: string): string => value.trim().toLocaleLowerCase();

export function filterCandidates(candidates: readonly PickerCandidate[], search: string, expertise: string): PickerCandidate[] {
  const searchTerm = normalized(search);
  const expertiseTerm = normalized(expertise);
  return candidates.filter((candidate) => (
    (searchTerm.length === 0 || normalized(candidate.mentor.name).includes(searchTerm))
    && (expertiseTerm.length === 0 || candidate.mentor.expertise.some((tag) => normalized(tag) === expertiseTerm))
  ));
}

export function selectCandidate(candidates: readonly PickerCandidate[], mentorProfileId: string): PickerCandidate | null {
  const candidate = candidates.find((item) => item.mentor.id === mentorProfileId);
  return candidate === undefined || candidate.hardConflict ? null : candidate;
}

export function canSubmitAssignment(
  candidate: PickerCandidate | null,
  overrideAcknowledged: boolean,
  overrideReason: string,
): boolean {
  if (candidate === null || candidate.hardConflict) return false;
  if (candidate.requiredOverrideTypes.length === 0) return true;
  return overrideAcknowledged && overrideReason.trim().length > 0;
}

export function buildCommitPayload(input: {
  semesterId: string;
  startupSemesterId: string;
  sessionDateId: string;
  timeSlot: PickerTimeSlot;
  format: PickerFormat;
  topic: string;
  candidate: PickerCandidate;
  candidateRank: number;
  search: string;
  expertiseFilter: string;
  overrideAcknowledged: boolean;
  overrideReason: string;
}): PickerCommitPayload {
  const overridesRequired = input.candidate.requiredOverrideTypes.length > 0;
  return {
    semesterId: input.semesterId,
    startupSemesterId: input.startupSemesterId,
    sessionDateId: input.sessionDateId,
    timeSlot: input.timeSlot,
    mentorProfileId: input.candidate.mentor.id,
    format: input.format,
    topic: input.topic.trim() || null,
    overrideTypes: [...input.candidate.requiredOverrideTypes],
    overrideReason: overridesRequired && input.overrideAcknowledged ? input.overrideReason.trim() || null : null,
    rankingContext: {
      rank: input.candidateRank,
      score: input.candidate.score,
      reasons: [...input.candidate.reasons],
      explanations: [...input.candidate.explanations],
      rankingEligible: input.candidate.rankingEligible,
      search: input.search.trim(),
      expertiseFilter: input.expertiseFilter.trim(),
    },
  };
}
