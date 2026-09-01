export type PickerFormat = "online" | "in_person" | "hybrid";
export type PickerTimeSlot = "3:30-4:15" | "4:15-5:00";
export type PickerOverrideType = "availability" | "capacity" | "expertise" | "second_slot";

export interface PickerCandidate {
  mentor: {
    id: string;
    scheduleMentorIds: string[];
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

export interface PickerCommitPayload {
  semesterId: string;
  startupSemesterId: string;
  meetingId: string;
  slot: 1 | 2;
  mentorSemesterId: string;
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
}): ScheduleStartupColumn[] {
  const organizationNames = new Map(input.organizations.map((organization) => [organization.id, organization.name]));
  return input.startupSemesters.map((startupSemester) => ({
    startupSemesterId: startupSemester.id,
    startupId: startupSemester.id,
    name: organizationNames.get(startupSemester.startupOrganizationId) ?? "Unnamed startup",
    linked: true,
  }));
}

export function buildScheduleRows(
  meetings: ReadonlyArray<{ id: string; date: string; label: string | null }>,
): Array<{ dateId: string; meetingId: string; date: string; label: string | null; slot: PickerTimeSlot }> {
  return [...meetings]
    .sort((left, right) => left.date.localeCompare(right.date))
    .flatMap((meeting) => ([
      { dateId: `${meeting.id}:1`, meetingId: meeting.id, date: meeting.date, label: meeting.label, slot: "3:30-4:15" as const },
      { dateId: `${meeting.id}:2`, meetingId: meeting.id, date: meeting.date, label: meeting.label, slot: "4:15-5:00" as const },
    ]));
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
  meetingId: string;
  slot: 1 | 2;
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
  const mentorSemesterId = input.candidate.mentor.scheduleMentorIds[0];
  if (mentorSemesterId === undefined) throw new Error("Candidate is missing its semester mentor record.");
  return {
    semesterId: input.semesterId,
    startupSemesterId: input.startupSemesterId,
    meetingId: input.meetingId,
    slot: input.slot,
    mentorSemesterId,
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
