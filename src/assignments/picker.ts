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

export interface ScheduleStartupColumn {
  startupSemesterId: string;
  startupId: string | null;
  name: string;
  linked: boolean;
}

export interface HistoricalScheduleStartupColumn {
  startupSemesterId: null;
  startupId: string;
  name: string;
  linked: false;
  historicalOnly: true;
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

export function selectVisibleCandidate(visibleCandidates: readonly PickerCandidate[], mentorProfileId: string): PickerCandidate | null {
  return selectCandidate(visibleCandidates, mentorProfileId);
}

export function deriveStartupNeeds(startup: {
  mentorshipNeeds: readonly string[];
  preferredExpertiseTags: readonly string[];
}): { primary: string | null; secondary: string | null; preferredExpertise: string[] } {
  return {
    primary: startup.mentorshipNeeds[0] ?? null,
    secondary: startup.mentorshipNeeds[1] ?? null,
    preferredExpertise: [...startup.preferredExpertiseTags],
  };
}

export function buildScheduleStartupColumns(input: {
  startupSemesters: ReadonlyArray<{ id: string; startupOrganizationId: string }>;
  organizations: ReadonlyArray<{ id: string; name: string }>;
  bridges: ReadonlyArray<{ startupSemesterId: string; startupId: string; isPrimaryContact: boolean }>;
}): ScheduleStartupColumn[] {
  const organizationNames = new Map(input.organizations.map((organization) => [organization.id, organization.name]));
  return input.startupSemesters.map((startupSemester) => {
    const bridge = input.bridges
      .filter((candidate) => candidate.startupSemesterId === startupSemester.id)
      .sort((left, right) => Number(right.isPrimaryContact) - Number(left.isPrimaryContact) || left.startupId.localeCompare(right.startupId))[0];
    const startupId = bridge?.startupId ?? null;
    return {
      startupSemesterId: startupSemester.id,
      startupId,
      name: organizationNames.get(startupSemester.startupOrganizationId) ?? "Unnamed startup",
      linked: startupId !== null,
    };
  });
}

export function buildHistoricalScheduleStartupColumns(input: {
  semesterId: string;
  canonicalStartupIds: readonly string[];
  sessions: ReadonlyArray<{ semesterId: string | null; startupId: string | null; startupName: string | null }>;
}): HistoricalScheduleStartupColumn[] {
  const canonicalStartupIds = new Set(input.canonicalStartupIds);
  const namesByStartupId = new Map<string, string>();
  for (const session of input.sessions) {
    if (
      session.semesterId !== input.semesterId
      || session.startupId === null
      || canonicalStartupIds.has(session.startupId)
      || namesByStartupId.has(session.startupId)
    ) continue;
    namesByStartupId.set(session.startupId, session.startupName ?? "Historical startup");
  }
  return [...namesByStartupId].map(([startupId, name]) => ({
    startupSemesterId: null,
    startupId,
    name,
    linked: false,
    historicalOnly: true,
  }));
}

export function assignmentRefreshFeedback(input: {
  startupName: string;
  date: string;
  timeSlot: PickerTimeSlot;
  replayed: boolean;
  refreshSucceeded: boolean;
}): { message: string; retryRequired: boolean } {
  if (!input.refreshSucceeded) {
    return {
      message: `${input.startupName}'s assignment was saved, but the schedule refresh failed.`,
      retryRequired: true,
    };
  }
  return {
    message: input.replayed
      ? `${input.startupName}'s assignment was already saved and the schedule refreshed.`
      : `${input.startupName}'s mentor was assigned for ${input.date}, ${input.timeSlot}.`,
    retryRequired: false,
  };
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
