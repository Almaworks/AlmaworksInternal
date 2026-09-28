import type {
  FridayAgendaItem,
  FridayGroupCode,
  FridayProgram,
  FridayProgramResponse,
  FridayStartupAssignment,
  FridaySpeaker,
} from "./types.ts";

export const FRIDAY_AGENDA_VERSION = 1;
export const DEFAULT_GROUP_A_FACILITATOR = "Les";
export const DEFAULT_GROUP_B_FACILITATOR = "Eric Chan";

export class FridayProgramRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FridayProgramRequestError";
  }
}

export class FridayProgramDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FridayProgramDataError";
  }
}

export interface FridayMeetingRecord {
  canceledAt?: string;
  canceledByProfileId?: string | null;
  id: string;
  label: string | null;
  meetingDate: string;
}

export interface FridayProgramRecord {
  agendaVersion: number;
  generatedAt: string;
  groupAFacilitator: string;
  groupBFacilitator: string;
  id: string;
  meetingId: string;
}

export interface FridayAssignmentRecord {
  group: FridayGroupCode;
  position: number;
  programId: string;
  startupName: string;
  startupOrganizationId: string;
  startupSemesterId: string;
  startupSlug: string;
}

export interface FridayProgramModelInput {
  assignments: readonly FridayAssignmentRecord[];
  meetings: readonly FridayMeetingRecord[];
  programs: readonly FridayProgramRecord[];
  semesterId: string;
  cancellationSetupPending?: boolean;
  speakerSetupPending?: boolean;
  speakers?: readonly (FridaySpeaker & { meetingId: string })[];
}

function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) throw new FridayProgramRequestError(`${field} must be at most ${max} characters.`);
  return value.trim() || null;
}

function requiredText(value: unknown, field: string, max: number): string {
  const result = optionalText(value, field, max);
  if (!result) throw new FridayProgramRequestError(`${field} is required.`);
  return result;
}

function optionalUrl(value: unknown, field: string): string | null {
  const result = optionalText(value, field, 500);
  if (!result) return null;
  try {
    const url = new URL(result);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("unsafe URL");
    return url.toString();
  } catch { throw new FridayProgramRequestError(`${field} must be an HTTPS URL.`); }
}

export function parseSaveFridaySpeakerRequest(value: unknown): { semesterId: string; meetingId: string; speaker: FridaySpeaker } {
  const body = asRecord(value);
  const contactEmail = requiredText(body.contactEmail, "Contact email", 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(contactEmail)) throw new FridayProgramRequestError("Contact email must be valid.");
  return {
    semesterId: requireUuid(body.semesterId, "semesterId"),
    meetingId: requireUuid(body.meetingId, "meetingId"),
    speaker: {
      name: requiredText(body.name, "Speaker name", 160),
      bio: requiredText(body.bio, "Bio", 3000),
      expertise: requiredText(body.expertise, "Expertise", 500),
      topic: requiredText(body.topic, "Topic", 300),
      contactEmail,
      contactPhone: optionalText(body.contactPhone, "Contact phone", 100),
      linkedinUrl: optionalUrl(body.linkedinUrl, "LinkedIn"),
      websiteUrl: optionalUrl(body.websiteUrl, "Website"),
    },
  };
}

export function parseRemoveFridaySpeakerRequest(value: unknown): { semesterId: string; meetingId: string } {
  const body = asRecord(value);
  return {
    semesterId: requireUuid(body.semesterId, "semesterId"),
    meetingId: requireUuid(body.meetingId, "meetingId"),
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function requireUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new FridayProgramRequestError(`${field} is required.`);
  }
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new FridayProgramRequestError(`${field} must be a valid UUID.`);
  }
  return normalized;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new FridayProgramRequestError("Request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

export function parseFridayProgramQuery(url: string): { meetingId?: string; semesterId: string } {
  const params = new URL(url).searchParams;
  const semesterId = requireUuid(params.get("semesterId"), "semesterId");
  const meetingId = params.get("meetingId");
  return meetingId === null
    ? { semesterId }
    : { semesterId, meetingId: requireUuid(meetingId, "meetingId") };
}

export function parseGenerateFridayProgramRequest(value: unknown): { meetingId: string; regenerate: boolean; semesterId: string } {
  const body = asRecord(value);
  const regenerate = body.regenerate ?? false;
  if (typeof regenerate !== "boolean") throw new FridayProgramRequestError("regenerate must be a boolean.");
  return {
    semesterId: requireUuid(body.semesterId, "semesterId"),
    meetingId: requireUuid(body.meetingId, "meetingId"),
    regenerate,
  };
}

export function parseSetFridayWeekCanceledRequest(value: unknown): { canceled: boolean; meetingId: string; semesterId: string } {
  const body = asRecord(value);
  if (typeof body.canceled !== "boolean") throw new FridayProgramRequestError("canceled must be a boolean.");
  return {
    semesterId: requireUuid(body.semesterId, "semesterId"),
    meetingId: requireUuid(body.meetingId, "meetingId"),
    canceled: body.canceled,
  };
}

export function buildFridayAgenda(
  agendaVersion: number,
  groupAFacilitator: string,
  groupBFacilitator: string,
): FridayAgendaItem[] {
  if (agendaVersion !== FRIDAY_AGENDA_VERSION) {
    throw new FridayProgramDataError(`Unsupported Friday agenda version: ${agendaVersion}.`);
  }
  return [
    { key: "standups", offsetMinutes: 0, durationMinutes: 15, label: "Startup standups" },
    { key: "speaker", offsetMinutes: 15, durationMinutes: 45, label: "Speaker session" },
    {
      key: "group_round_1",
      offsetMinutes: 60,
      durationMinutes: 30,
      label: "Small-group round 1",
      facilitators: { A: groupAFacilitator, B: groupBFacilitator },
    },
    {
      key: "group_round_2",
      offsetMinutes: 90,
      durationMinutes: 30,
      label: "Small-group round 2",
      facilitators: { A: groupBFacilitator, B: groupAFacilitator },
    },
  ];
}

function assertCompatibleAgenda(programs: readonly FridayProgramRecord[]): FridayProgramRecord {
  const baseline = programs[0] ?? {
    id: "",
    meetingId: "",
    agendaVersion: FRIDAY_AGENDA_VERSION,
    groupAFacilitator: DEFAULT_GROUP_A_FACILITATOR,
    groupBFacilitator: DEFAULT_GROUP_B_FACILITATOR,
    generatedAt: "",
  };
  for (const program of programs) {
    if (
      program.agendaVersion !== baseline.agendaVersion
      || program.groupAFacilitator !== baseline.groupAFacilitator
      || program.groupBFacilitator !== baseline.groupBFacilitator
    ) {
      throw new FridayProgramDataError("Saved Friday programs use incompatible agenda configurations.");
    }
  }
  return baseline;
}

function toStartupAssignment(assignment: FridayAssignmentRecord): FridayStartupAssignment {
  return {
    startupSemesterId: assignment.startupSemesterId,
    startupOrganizationId: assignment.startupOrganizationId,
    name: assignment.startupName,
    slug: assignment.startupSlug,
    position: assignment.position,
  };
}

function toSpeaker(speaker: FridaySpeaker & { meetingId: string }): FridaySpeaker {
  return { name: speaker.name, bio: speaker.bio, expertise: speaker.expertise, topic: speaker.topic, contactEmail: speaker.contactEmail, contactPhone: speaker.contactPhone, linkedinUrl: speaker.linkedinUrl, websiteUrl: speaker.websiteUrl };
}

export function buildFridayProgramResponse(input: FridayProgramModelInput): FridayProgramResponse {
  const programsById = new Map(input.programs.map((program) => [program.id, program]));
  const programsByMeeting = new Map(input.programs.map((program) => [program.meetingId, program]));
  const meetingIds = new Set(input.meetings.map((meeting) => meeting.id));
  const speakersByMeeting = new Map((input.speakers ?? []).map((speaker) => [speaker.meetingId, speaker]));
  for (const speaker of input.speakers ?? []) {
    if (!meetingIds.has(speaker.meetingId)) throw new FridayProgramDataError("A saved Friday speaker has no matching meeting.");
  }
  for (const program of input.programs) {
    if (!meetingIds.has(program.meetingId)) {
      throw new FridayProgramDataError("A saved Friday program has no matching meeting.");
    }
  }
  for (const assignment of input.assignments) {
    if (!programsById.has(assignment.programId)) {
      throw new FridayProgramDataError("A saved Friday assignment has no matching program.");
    }
  }

  const agendaProgram = assertCompatibleAgenda(input.programs);
  const assignmentsByProgram = new Map<string, FridayAssignmentRecord[]>();
  for (const assignment of input.assignments) {
    const existing = assignmentsByProgram.get(assignment.programId) ?? [];
    existing.push(assignment);
    assignmentsByProgram.set(assignment.programId, existing);
  }

  return {
    semesterId: input.semesterId,
    ...(input.cancellationSetupPending ? { cancellationSetupPending: true } : {}),
    ...(input.speakerSetupPending ? { speakerSetupPending: true } : {}),
    agenda: buildFridayAgenda(
      agendaProgram.agendaVersion,
      agendaProgram.groupAFacilitator,
      agendaProgram.groupBFacilitator,
    ),
    meetings: input.meetings.map((meeting) => {
      const saved = programsByMeeting.get(meeting.id);
      const cancellation = meeting.canceledAt
        ? { canceledAt: meeting.canceledAt, canceledByProfileId: meeting.canceledByProfileId ?? null, status: "canceled" as const }
        : null;
      if (saved === undefined) {
        return {
          meetingId: meeting.id,
          meetingDate: meeting.meetingDate,
          label: meeting.label,
          ...(cancellation ?? { status: "unpublished" as const }),
          program: null,
          speaker: speakersByMeeting.has(meeting.id) ? toSpeaker(speakersByMeeting.get(meeting.id)!) : null,
        };
      }
      const grouped = assignmentsByProgram.get(saved.id) ?? [];
      const program: FridayProgram = {
        programId: saved.id,
        generatedAt: saved.generatedAt,
        groups: {
          A: grouped.filter((item) => item.group === "A").sort((left, right) => left.position - right.position).map(toStartupAssignment),
          B: grouped.filter((item) => item.group === "B").sort((left, right) => left.position - right.position).map(toStartupAssignment),
        },
      };
      return {
        meetingId: meeting.id,
        meetingDate: meeting.meetingDate,
        label: meeting.label,
        ...(cancellation ?? { status: "published" as const }),
        program,
        speaker: speakersByMeeting.has(meeting.id) ? toSpeaker(speakersByMeeting.get(meeting.id)!) : null,
      };
    }),
  };
}
