import type {
  FridayAgendaItem,
  FridayMeetingSummary,
  FridayProgram,
  FridayStartupAssignment,
  FridaySpeaker,
} from "../../src/friday-program/types";

export type {
  FridayAgendaItem,
  FridayMeetingSummary as FridayProgramMeeting,
  FridayProgram,
  FridayStartupAssignment as FridayStartupGroupMember,
  FridaySpeaker,
};

type FridayProgramMeeting = FridayMeetingSummary;

export interface FridayMeetingSelection {
  meeting: FridayProgramMeeting;
  weekNumber: number;
  timing: "current" | "upcoming" | "most-recent";
}

export type FridayMeetingProgramState =
  | { kind: "unpublished"; message: string }
  | { kind: "published"; message: null };

export function agendaTimeLabel(item: FridayAgendaItem): string {
  return String(item.offsetMinutes) + "–" + String(item.offsetMinutes + item.durationMinutes) + " min";
}

export function meetingProgramState(meeting: FridayProgramMeeting): FridayMeetingProgramState {
  if (meeting.status === "unpublished" || meeting.program === null) {
    return {
      kind: "unpublished",
      message: "Groups have not been published for this Friday yet.",
    };
  }
  return { kind: "published", message: null };
}

export function selectDefaultFridayMeeting(
  meetings: readonly FridayProgramMeeting[],
  today: string,
): FridayMeetingSelection | null {
  if (meetings.length === 0) return null;

  const nextIndex = meetings.findIndex((meeting) => meeting.meetingDate >= today);
  const index = nextIndex === -1 ? meetings.length - 1 : nextIndex;
  const meeting = meetings[index];
  if (!meeting) return null;

  return {
    meeting,
    weekNumber: index + 1,
    timing: meeting.meetingDate === today ? "current" : nextIndex === -1 ? "most-recent" : "upcoming",
  };
}

export function participantGroupLabel(
  meeting: FridayProgramMeeting,
  startupSemesterId: string | null | undefined,
): string | null {
  if (!startupSemesterId || meeting.program === null) return null;
  if (meeting.program.groups.A.some((startup) => startup.startupSemesterId === startupSemesterId)) return "Group A";
  if (meeting.program.groups.B.some((startup) => startup.startupSemesterId === startupSemesterId)) return "Group B";
  return null;
}

export function isCurrentFridayProgramResponse(
  semesterId: string,
  response: Pick<{ semesterId: string }, "semesterId">,
): boolean {
  return response.semesterId === semesterId;
}

export function isFridayProgramResponse(value: unknown): value is {
  semesterId: string;
  agenda: FridayAgendaItem[];
  cancellationSetupPending?: boolean;
  meetings: FridayProgramMeeting[];
  speakerSetupPending?: boolean;
} {
  if (typeof value !== "object" || value === null) return false;
  const record = value as { semesterId?: unknown; agenda?: unknown; meetings?: unknown; speakerSetupPending?: unknown; cancellationSetupPending?: unknown };
  return typeof record.semesterId === "string"
    && (record.speakerSetupPending === undefined || typeof record.speakerSetupPending === "boolean")
    && (record.cancellationSetupPending === undefined || typeof record.cancellationSetupPending === "boolean")
    && Array.isArray(record.agenda)
    && record.agenda.every(isFridayAgendaItem)
    && Array.isArray(record.meetings)
    && record.meetings.every(isFridayMeeting);
}

function isFridayAgendaItem(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const item = value as { key?: unknown; offsetMinutes?: unknown; durationMinutes?: unknown; label?: unknown; facilitators?: unknown };
  const base = typeof item.key === "string"
    && typeof item.offsetMinutes === "number"
    && typeof item.durationMinutes === "number"
    && typeof item.label === "string";
  if (!base) return false;
  if (item.key !== "group_round_1" && item.key !== "group_round_2") return item.key === "standups" || item.key === "speaker";
  if (typeof item.facilitators !== "object" || item.facilitators === null) return false;
  const facilitators = item.facilitators as { A?: unknown; B?: unknown };
  return typeof facilitators.A === "string" && typeof facilitators.B === "string";
}

function isFridayMeeting(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const meeting = value as { meetingId?: unknown; meetingDate?: unknown; label?: unknown; status?: unknown; program?: unknown; speaker?: unknown; canceledAt?: unknown; canceledByProfileId?: unknown };
  if (typeof meeting.meetingId !== "string" || typeof meeting.meetingDate !== "string" || (meeting.label !== null && typeof meeting.label !== "string")) return false;
  if (meeting.speaker !== undefined && meeting.speaker !== null && !isFridaySpeaker(meeting.speaker)) return false;
  if (meeting.status === "unpublished") return meeting.program === null;
  if (meeting.status === "canceled") {
    return typeof meeting.canceledAt === "string"
      && (meeting.canceledByProfileId === null || typeof meeting.canceledByProfileId === "string")
      && (meeting.program === null || isFridayProgram(meeting.program));
  }
  return meeting.status === "published" && isFridayProgram(meeting.program);
}

export function isFridaySpeaker(value: unknown): value is FridaySpeaker {
  if (typeof value !== "object" || value === null) return false;
  const speaker = value as Record<string, unknown>;
  return ["name", "bio", "expertise", "topic", "contactEmail"].every((key) => typeof speaker[key] === "string")
    && ["contactPhone", "linkedinUrl", "websiteUrl"].every((key) => speaker[key] === null || typeof speaker[key] === "string");
}

export function isFridayProgram(value: unknown): value is FridayProgram {
  if (typeof value !== "object" || value === null) return false;
  const program = value as { programId?: unknown; generatedAt?: unknown; groups?: unknown };
  if (typeof program.programId !== "string" || typeof program.generatedAt !== "string" || typeof program.groups !== "object" || program.groups === null) return false;
  const groups = program.groups as { A?: unknown; B?: unknown };
  return Array.isArray(groups.A) && Array.isArray(groups.B) && groups.A.every(isFridayStartup) && groups.B.every(isFridayStartup);
}

function isFridayStartup(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const startup = value as Record<string, unknown>;
  return typeof startup.startupSemesterId === "string"
    && typeof startup.startupOrganizationId === "string"
    && typeof startup.name === "string"
    && typeof startup.slug === "string"
    && typeof startup.position === "number";
}

export function applyPublishedProgram(
  meetings: FridayProgramMeeting[],
  meetingId: string,
  program: FridayProgram,
): FridayProgramMeeting[] {
  return meetings.map((meeting) => meeting.meetingId === meetingId
    ? { ...meeting, status: "published", program }
    : meeting);
}
