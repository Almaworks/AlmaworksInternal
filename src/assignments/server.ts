import type { SupabaseClient } from "@supabase/supabase-js";

import { AuthorizationError } from "../auth/server.ts";
import type { Database, Json } from "../db/types.ts";
import {
  rankMentorCandidates,
  type AssignmentSlot,
  type MeetingFormat,
  type RankedMentor,
} from "./ranking.ts";

type Client = SupabaseClient<Database>;
type AssignmentStatus = Database["public"]["Enums"]["session_status"];
export type AssignmentTimeSlot = "3:30-4:15" | "4:15-5:00";

export class AssignmentHttpError extends Error {
  readonly status: 400 | 401 | 403 | 409;
  readonly code: string;
  readonly field: string | undefined;

  constructor(status: 400 | 401 | 403 | 409, code: string, message: string, field?: string) {
    super(message);
    this.name = "AssignmentHttpError";
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

export interface CandidateQuery {
  semesterId: string;
  startupSemesterId: string;
  sessionDateId: string;
  timeSlot: AssignmentTimeSlot;
}

export interface CommitInput extends CandidateQuery {
  mentorProfileId: string;
  idempotencyKey: string;
  format: string;
  topic: string | null;
  overrideTypes: string[];
  overrideReason: string | null;
  rankingContext: Json;
}

export interface CandidateSourceData {
  sessionDate: { id: string; semesterId: string; date: string } | null;
  startup: {
    id: string;
    semesterId: string;
    companySnapshot: string | null;
    goals: string[];
    mentorNeedContext: string | null;
    mentorNeedNoPreference: boolean;
    mentorshipNeeds: string[];
    preferredExpertiseTags: string[];
    stage: Database["public"]["Enums"]["startup_stage"] | null;
  } | null;
  mentors: Array<{
    id: string;
    profileId: string;
    name: string;
    expertise: string[];
    preferredFormat: string | null;
  }>;
  availability: Array<{ profileId: string; sessionDateId: string; isAvailable: boolean }>;
  sessions: Array<{
    mentorScheduleId: string;
    sessionDateId: string;
    timeSlot: string | null;
    status: AssignmentStatus;
  }>;
}

export interface AssignmentDataSource {
  loadCandidateData(input: CandidateQuery): Promise<CandidateSourceData>;
  commitAssignment(input: CommitInput): Promise<Json>;
}

export interface CandidateContext {
  startup: NonNullable<CandidateSourceData["startup"]>;
  slot: AssignmentSlot;
  candidates: RankedMentor[];
}

export interface AssignmentRouteDependencies {
  authorize(request: Request, semesterId: string): Promise<AssignmentDataSource>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function requiredUuid(value: string | null, field: string): string {
  if (value === null || !UUID.test(value)) {
    throw new AssignmentHttpError(400, "validation_error", `${field} must be a UUID.`, field);
  }
  return value;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AssignmentHttpError(400, "validation_error", `${field} is required.`, field);
  }
  return value.trim();
}

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new AssignmentHttpError(400, "validation_error", `${field} must be a string.`, field);
  }
  return value.trim() || null;
}

function requiredTimeSlot(value: string | null): AssignmentTimeSlot {
  if (value === "3:30-4:15" || value === "4:15-5:00") return value;
  throw new AssignmentHttpError(400, "validation_error", "timeSlot is invalid.", "timeSlot");
}

function requiredJsonObject(value: unknown, field: string): Json {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new AssignmentHttpError(400, "validation_error", `${field} must be a JSON object.`, field);
  }
  return value as Json;
}

function stringArray(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new AssignmentHttpError(400, "validation_error", `${field} must be an array of strings.`, field);
  }
  return value.map((item) => item.trim()).filter((item) => item.length > 0);
}

export function parseCandidateQuery(url: URL): CandidateQuery {
  return {
    semesterId: requiredUuid(url.searchParams.get("semesterId"), "semesterId"),
    startupSemesterId: requiredUuid(url.searchParams.get("startupSemesterId"), "startupSemesterId"),
    sessionDateId: requiredUuid(url.searchParams.get("sessionDateId"), "sessionDateId"),
    timeSlot: requiredTimeSlot(url.searchParams.get("timeSlot")),
  };
}

export function parseCommitBody(value: unknown, headers: Headers): CommitInput {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new AssignmentHttpError(400, "invalid_json", "Request body must be a JSON object.");
  }
  const body = value as Record<string, unknown>;
  const idempotencyKey = headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) {
    throw new AssignmentHttpError(400, "validation_error", "Idempotency-Key header is required.", "Idempotency-Key");
  }
  return {
    semesterId: requiredUuid(typeof body.semesterId === "string" ? body.semesterId : null, "semesterId"),
    startupSemesterId: requiredUuid(typeof body.startupSemesterId === "string" ? body.startupSemesterId : null, "startupSemesterId"),
    sessionDateId: requiredUuid(typeof body.sessionDateId === "string" ? body.sessionDateId : null, "sessionDateId"),
    timeSlot: requiredTimeSlot(typeof body.timeSlot === "string" ? body.timeSlot : null),
    mentorProfileId: requiredUuid(typeof body.mentorProfileId === "string" ? body.mentorProfileId : null, "mentorProfileId"),
    idempotencyKey,
    format: requiredString(body.format, "format"),
    topic: optionalString(body.topic, "topic"),
    overrideTypes: stringArray(body.overrideTypes, "overrideTypes"),
    overrideReason: optionalString(body.overrideReason, "overrideReason"),
    rankingContext: requiredJsonObject(body.rankingContext, "rankingContext"),
  };
}

function normalizedFormat(value: string | null): MeetingFormat {
  if (value === "remote") return "remote";
  if (value === "hybrid") return "hybrid";
  return "in_person";
}

function needsForRanking(startup: NonNullable<CandidateSourceData["startup"]>) {
  const [preferredPrimary, preferredSecondary] = startup.preferredExpertiseTags;
  const [needPrimary, needSecondary] = startup.mentorshipNeeds;
  return {
    primaryNeed: preferredPrimary ?? needPrimary ?? null,
    secondaryNeed: preferredSecondary ?? needPrimary ?? needSecondary ?? null,
  };
}

function staleMapping(): AssignmentHttpError {
  return new AssignmentHttpError(400, "validation_error", "Slot and startup must belong to the selected semester.");
}

export function buildCandidateContext(input: CandidateQuery, data: CandidateSourceData): CandidateContext {
  const { sessionDate, startup } = data;
  if (
    sessionDate === null
    || startup === null
    || sessionDate.id !== input.sessionDateId
    || sessionDate.semesterId !== input.semesterId
    || startup.id !== input.startupSemesterId
    || startup.semesterId !== input.semesterId
  ) throw staleMapping();

  const [start, end] = input.timeSlot.split("-");
  const slot: AssignmentSlot = {
    id: `${sessionDate.id}:${input.timeSlot}`,
    semesterId: input.semesterId,
    date: sessionDate.date,
    start: start ?? "",
    end: end ?? "",
    format: "in_person",
  };
  const activeSessions = data.sessions.filter((session) => session.status !== "declined");
  const firstSlotMentorIds = input.timeSlot === "4:15-5:00"
    ? activeSessions
      .filter((session) => session.sessionDateId === input.sessionDateId && session.timeSlot === "3:30-4:15")
      .map((session) => session.mentorScheduleId)
    : [];
  const profileIdByScheduleId = new Map(data.mentors.map((mentor) => [mentor.id, mentor.profileId]));
  const excludeMentorIds = firstSlotMentorIds
    .map((mentorScheduleId) => profileIdByScheduleId.get(mentorScheduleId))
    .filter((profileId): profileId is string => profileId !== undefined);
  const mentors = data.mentors.map((mentor) => ({
    id: mentor.profileId,
    name: mentor.name,
    expertise: mentor.expertise,
    availability: data.availability
      .filter((availability) => availability.profileId === mentor.profileId && availability.isAvailable && availability.sessionDateId === input.sessionDateId)
      .map(() => sessionDate.date),
    recentMeetingCount: activeSessions.filter((session) => session.mentorScheduleId === mentor.id && session.sessionDateId === input.sessionDateId).length,
    assignmentLoad: activeSessions.filter((session) => session.mentorScheduleId === mentor.id).length,
    formats: [normalizedFormat(mentor.preferredFormat)],
  }));
  return {
    startup,
    slot,
    candidates: rankMentorCandidates({
      ...needsForRanking(startup),
      slot,
      mentors,
      excludeMentorIds,
    }),
  };
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") return error.code;
  return undefined;
}

function responseForError(error: unknown): Response {
  let status = 500;
  let code = "internal_error";
  const message = errorMessage(error, "Unexpected error.");
  let field: string | undefined;
  if (error instanceof AuthorizationError) {
    status = error.status;
    code = error.status === 401 ? "unauthenticated" : error.status === 403 ? "forbidden" : "internal_error";
  } else if (error instanceof AssignmentHttpError) {
    status = error.status;
    code = error.code;
    field = error.field;
  }
  return Response.json({ error: { code, message, ...(field === undefined ? {} : { field }) } }, { status });
}

export function createAssignmentRoutes(dependencies: AssignmentRouteDependencies) {
  return {
    getCandidates: async (request: Request): Promise<Response> => {
      try {
        const query = parseCandidateQuery(new URL(request.url));
        const source = await dependencies.authorize(request, query.semesterId);
        return Response.json({ data: buildCandidateContext(query, await source.loadCandidateData(query)) });
      } catch (error) {
        return responseForError(error);
      }
    },
    commit: async (request: Request): Promise<Response> => {
      try {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          throw new AssignmentHttpError(400, "invalid_json", "Request body must be valid JSON.");
        }
        const input = parseCommitBody(body, request.headers);
        const source = await dependencies.authorize(request, input.semesterId);
        return Response.json({ data: await source.commitAssignment(input) }, { status: 201 });
      } catch (error) {
        return responseForError(error);
      }
    },
  };
}

function checkResult(result: { error: unknown }): void {
  if (result.error !== null) throw new Error(errorMessage(result.error, "Unable to load assignment data."));
}

export function createSupabaseAssignmentDataSource(client: Client): AssignmentDataSource {
  return {
    loadCandidateData: async (input) => {
      const [sessionDateResult, startupResult, mentorsResult, availabilityResult, sessionsResult] = await Promise.all([
        client.from("session_dates").select("id, date, semester_id").eq("id", input.sessionDateId).eq("semester_id", input.semesterId).maybeSingle(),
        client.from("startup_semesters").select("id, semester_id, company_snapshot, goals, mentor_need_context, mentor_need_no_preference, mentorship_needs, preferred_expertise_tags, stage").eq("id", input.startupSemesterId).eq("semester_id", input.semesterId).maybeSingle(),
        client.from("mentors").select("id, user_id, full_name, expertise_tags, preferred_format").eq("semester_id", input.semesterId).eq("is_active", true),
        client.from("availability").select("user_id, session_date_id, is_available").eq("session_date_id", input.sessionDateId),
        client.from("sessions").select("mentor_id, session_date_id, time_slot, status").eq("semester_id", input.semesterId),
      ]);
      [sessionDateResult, startupResult, mentorsResult, availabilityResult, sessionsResult].forEach(checkResult);
      return {
        sessionDate: sessionDateResult.data === null ? null : { id: sessionDateResult.data.id, semesterId: sessionDateResult.data.semester_id, date: sessionDateResult.data.date },
        startup: startupResult.data === null ? null : {
          id: startupResult.data.id,
          semesterId: startupResult.data.semester_id,
          companySnapshot: startupResult.data.company_snapshot,
          goals: startupResult.data.goals,
          mentorNeedContext: startupResult.data.mentor_need_context,
          mentorNeedNoPreference: startupResult.data.mentor_need_no_preference,
          mentorshipNeeds: startupResult.data.mentorship_needs,
          preferredExpertiseTags: startupResult.data.preferred_expertise_tags,
          stage: startupResult.data.stage,
        },
        mentors: (mentorsResult.data ?? []).flatMap((mentor) => mentor.user_id === null ? [] : [{
          id: mentor.id,
          profileId: mentor.user_id,
          name: mentor.full_name,
          expertise: mentor.expertise_tags,
          preferredFormat: mentor.preferred_format,
        }]),
        availability: (availabilityResult.data ?? []).map((availability) => ({
          profileId: availability.user_id,
          sessionDateId: availability.session_date_id,
          isAvailable: availability.is_available,
        })),
        sessions: (sessionsResult.data ?? []).map((session) => ({
          mentorScheduleId: session.mentor_id,
          sessionDateId: session.session_date_id,
          timeSlot: session.time_slot,
          status: session.status,
        })),
      };
    },
    commitAssignment: async (input) => {
      const { data, error } = await client.rpc("commit_mentor_assignment", {
        p_semester_id: input.semesterId,
        p_session_date_id: input.sessionDateId,
        p_time_slot: input.timeSlot,
        p_startup_semester_id: input.startupSemesterId,
        p_mentor_profile_id: input.mentorProfileId,
        p_idempotency_key: input.idempotencyKey,
        p_format: input.format,
        p_topic: input.topic ?? undefined,
        p_override_types: input.overrideTypes,
        p_override_reason: input.overrideReason ?? undefined,
        p_ranking_context: input.rankingContext,
      });
      if (error !== null) {
        const code = errorCode(error);
        if (["23505", "23514", "40001"].includes(code ?? "")) throw new AssignmentHttpError(409, "assignment_conflict", error.message);
        if (code === "42501") throw new AssignmentHttpError(403, "forbidden", error.message);
        throw new AssignmentHttpError(400, "validation_error", error.message);
      }
      return data;
    },
  };
}
