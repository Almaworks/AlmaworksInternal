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
type AssignmentStatus = string;
export type AssignmentTimeSlot = "3:30-4:15" | "4:15-5:00";
export type AssignmentFormat = "online" | "in_person" | "hybrid";
export type RequiredOverrideType = "availability" | "capacity" | "expertise" | "second_slot";

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
  meetingId: string;
  slot: 1 | 2;
  format?: AssignmentFormat;
}

export interface CommitInput extends CandidateQuery {
  mentorSemesterId: string;
  idempotencyKey: string;
  format: AssignmentFormat;
  topic: string | null;
  overrideTypes: string[];
  overrideReason: string | null;
  rankingContext: Json;
}

export interface CandidateSourceData {
  sessionDate: { id: string; semesterId: string; date: string } | null;
  sessionDates: Array<{ id: string; semesterId: string; date: string }>;
  startupScheduleId: string | null;
  startup: {
    id: string;
    semesterId: string;
    companySnapshot: string | null;
    goals: string[];
    mentorNeedContext: string | null;
    mentorNeedNoPreference: boolean;
    mentorshipNeeds: string[];
    stage: Database["public"]["Enums"]["startup_stage"] | null;
  } | null;
  mentors: Array<{
    id: string;
    scheduleMentorIds: string[];
    profileId: string;
    name: string;
    expertise: string[];
    preferredFormat: string | null;
    capacity: number;
  }>;
  availability: Array<{ profileId: string; sessionDateId: string; timeSlot?: AssignmentTimeSlot; isAvailable: boolean }>;
  sessions: Array<{
    mentorScheduleId: string;
    startupScheduleId: string | null;
    sessionDateId: string;
    timeSlot: string | null;
    status: AssignmentStatus;
  }>;
}

export interface AssignmentDataSource {
  loadCandidateData(input: CandidateQuery): Promise<CandidateSourceData>;
  findAssignmentReplay?(input: CommitInput): Promise<Json | null>;
  commitAssignment(input: CommitInput): Promise<Json>;
}

export interface CandidateContext {
  startup: NonNullable<CandidateSourceData["startup"]>;
  slot: AssignmentSlot;
  candidates: AssignmentCandidate[];
}

export interface AssignmentCandidate extends RankedMentor {
  mentor: RankedMentor["mentor"] & { scheduleMentorIds: string[] };
  rankingEligible: boolean;
  hardConflict: boolean;
  hardConflictTypes: string[];
  requiredOverrideTypes: RequiredOverrideType[];
  requiresOverrideReason: boolean;
  explanations: string[];
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

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new AssignmentHttpError(400, "validation_error", `${field} must be a string.`, field);
  }
  return value.trim() || null;
}

function requiredSlot(value: string | null, field = "slot"): 1 | 2 {
  if (value === "1") return 1;
  if (value === "2") return 2;
  throw new AssignmentHttpError(400, "validation_error", `${field} must be 1 or 2.`, field);
}

function numericSlot(value: unknown): 1 | 2 {
  if (value === 1 || value === 2) return value;
  throw new AssignmentHttpError(400, "validation_error", "slot must be 1 or 2.", "slot");
}

function timeSlotFor(slot: 1 | 2): AssignmentTimeSlot {
  return slot === 1 ? "3:30-4:15" : "4:15-5:00";
}

function canonicalFormat(value: unknown, field: string, optional = false): AssignmentFormat {
  if (value === undefined && optional) return "in_person";
  if (typeof value !== "string") {
    throw new AssignmentHttpError(400, "validation_error", `${field} is unsupported.`, field);
  }
  const normalized = value.trim().toLocaleLowerCase().replace(/[ _-]/gu, "");
  if (["online", "remote", "virtual", "video"].includes(normalized)) return "online";
  if (["inperson", "onsite", "office"].includes(normalized)) return "in_person";
  if (normalized === "hybrid") return "hybrid";
  throw new AssignmentHttpError(400, "validation_error", `${field} is unsupported.`, field);
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
  const format = url.searchParams.get("format");
  return {
    semesterId: requiredUuid(url.searchParams.get("semesterId"), "semesterId"),
    startupSemesterId: requiredUuid(url.searchParams.get("startupSemesterId"), "startupSemesterId"),
    meetingId: requiredUuid(url.searchParams.get("meetingId"), "meetingId"),
    slot: requiredSlot(url.searchParams.get("slot")),
    ...(format === null ? {} : { format: canonicalFormat(format, "format") }),
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
    meetingId: requiredUuid(typeof body.meetingId === "string" ? body.meetingId : null, "meetingId"),
    slot: numericSlot(body.slot),
    mentorSemesterId: requiredUuid(typeof body.mentorSemesterId === "string" ? body.mentorSemesterId : null, "mentorSemesterId"),
    idempotencyKey,
    format: canonicalFormat(body.format, "format"),
    topic: optionalString(body.topic, "topic"),
    overrideTypes: stringArray(body.overrideTypes, "overrideTypes"),
    overrideReason: optionalString(body.overrideReason, "overrideReason"),
    rankingContext: requiredJsonObject(body.rankingContext, "rankingContext"),
  };
}

interface AssignmentCommitClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: Json | null;
    error: { code?: string; message: string } | null;
  }>;
}

export async function commitAssignment(client: AssignmentCommitClient, input: CommitInput): Promise<Json | null> {
  const { data, error } = await client.rpc("commit_mentor_assignment", {
    p_semester_id: input.semesterId,
    p_meeting_id: input.meetingId,
    p_slot: input.slot,
    p_startup_semester_id: input.startupSemesterId,
    p_mentor_semester_id: input.mentorSemesterId,
    p_idempotency_key: input.idempotencyKey,
    p_format: input.format,
    p_topic: input.topic ?? undefined,
    p_override_types: input.overrideTypes,
    p_override_reason: input.overrideReason ?? undefined,
    p_ranking_context: input.rankingContext,
  });
  if (error !== null) {
    if (["23505", "23514", "40001"].includes(error.code ?? "")) {
      throw new AssignmentHttpError(409, "assignment_conflict", "Assignment conflicts with the current schedule.");
    }
    if (error.code === "42501") throw new AssignmentHttpError(403, "forbidden", "Semester administrator access required.");
    if (error.code === "22023") throw new AssignmentHttpError(400, "validation_error", "Assignment input is invalid.");
    throw new Error("Assignment RPC failed.");
  }
  return data;
}

function normalizedFormat(value: string | null): MeetingFormat {
  const format = canonicalFormat(value ?? "in_person", "format");
  if (format === "online") return "remote";
  return format;
}

function needsForRanking(startup: NonNullable<CandidateSourceData["startup"]>) {
  const mentorshipNeeds = startup.mentorshipNeeds.filter((need) => need.trim().length > 0);
  return {
    primaryNeed: mentorshipNeeds[0] ?? null,
    secondaryNeed: mentorshipNeeds[1] ?? null,
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
    || sessionDate.id !== input.meetingId
    || sessionDate.semesterId !== input.semesterId
    || startup.id !== input.startupSemesterId
    || startup.semesterId !== input.semesterId
    || data.startupScheduleId === null
  ) throw staleMapping();

  const selectedTimeSlot = timeSlotFor(input.slot);
  const [start, end] = selectedTimeSlot.split("-");
  const slot: AssignmentSlot = {
    id: `${sessionDate.id}:${selectedTimeSlot}`,
    semesterId: input.semesterId,
    date: sessionDate.date,
    start: start ?? "",
    end: end ?? "",
    format: normalizedFormat(input.format ?? null),
  };
  const activeSessions = data.sessions.filter((session) => !["declined", "cancelled"].includes(session.status));
  const firstSlotMentorIds = input.slot === 2
    ? activeSessions.filter((session) => (
      session.sessionDateId === input.meetingId
      && session.startupScheduleId === data.startupScheduleId
      && session.timeSlot === "3:30-4:15"
    )).map((session) => session.mentorScheduleId)
    : [];
  const profileIdByScheduleId = new Map(data.mentors.flatMap((mentor) => (
    mentor.scheduleMentorIds.map((scheduleMentorId) => [scheduleMentorId, mentor.profileId] as const)
  )));
  const excludeMentorIds = firstSlotMentorIds
    .map((mentorScheduleId) => profileIdByScheduleId.get(mentorScheduleId))
    .filter((profileId): profileId is string => profileId !== undefined);
  const mentors = data.mentors.map((mentor) => ({
    id: mentor.profileId,
    scheduleMentorIds: mentor.scheduleMentorIds,
    name: mentor.name,
    expertise: mentor.expertise,
    availability: data.availability.some((availability) => (
      availability.profileId === mentor.profileId
      && availability.sessionDateId === input.meetingId
      && (availability.timeSlot === undefined || availability.timeSlot === selectedTimeSlot)
      && !availability.isAvailable
    )) ? [] : [sessionDate.date],
    recentMeetingCount: activeSessions.filter((session) => {
      const historicalDate = data.sessionDates.find((date) => date.id === session.sessionDateId)?.date;
      return mentor.scheduleMentorIds.includes(session.mentorScheduleId)
        && session.startupScheduleId === data.startupScheduleId
        && historicalDate !== undefined
        && historicalDate < sessionDate.date;
    }).length,
    assignmentLoad: activeSessions.filter((session) => mentor.scheduleMentorIds.includes(session.mentorScheduleId)).length,
    formats: [normalizedFormat(mentor.preferredFormat)],
  }));
  const neededExpertise = startup.mentorshipNeeds;
  const startupSlotConflict = activeSessions.some((session) => (
    session.sessionDateId === input.meetingId
    && session.timeSlot === selectedTimeSlot
    && session.startupScheduleId === data.startupScheduleId
  ));
  const ranked = rankMentorCandidates({
    ...needsForRanking(startup),
    slot,
    mentors,
    excludeMentorIds,
  });
  return {
    startup,
    slot,
    candidates: ranked.map((candidate): AssignmentCandidate => {
      const mentor = data.mentors.find((item) => item.profileId === candidate.mentor.id);
      if (mentor === undefined) throw new Error("Candidate mentor mapping is incomplete.");
      const availabilityBlocked = data.availability.some((availability) => (
        availability.profileId === mentor.profileId
        && availability.sessionDateId === input.meetingId
        && !availability.isAvailable
      ));
      const capacityExhausted = activeSessions.filter((session) => mentor.scheduleMentorIds.includes(session.mentorScheduleId)).length >= mentor.capacity;
      const expertiseMatched = neededExpertise.length === 0 || mentor.expertise.some((tag) => neededExpertise.includes(tag));
      const sameStartupOtherSlot = activeSessions.some((session) => (
        mentor.scheduleMentorIds.includes(session.mentorScheduleId)
        && session.startupScheduleId === data.startupScheduleId
        && session.sessionDateId === input.meetingId
        && session.timeSlot !== selectedTimeSlot
      ));
      const mentorSlotConflict = activeSessions.some((session) => (
        mentor.scheduleMentorIds.includes(session.mentorScheduleId)
        && session.sessionDateId === input.meetingId
        && session.timeSlot === selectedTimeSlot
      ));
      const requiredOverrideTypes: RequiredOverrideType[] = [
        ...(availabilityBlocked ? ["availability" as const] : []),
        ...(capacityExhausted ? ["capacity" as const] : []),
        ...(!expertiseMatched ? ["expertise" as const] : []),
        ...(sameStartupOtherSlot ? ["second_slot" as const] : []),
      ];
      const hardConflictTypes = [
        ...(mentorSlotConflict ? ["mentor_slot"] : []),
        ...(startupSlotConflict ? ["startup_slot"] : []),
      ];
      const explanations = [
        ...candidate.reasons,
        ...(availabilityBlocked ? ["Availability is explicitly marked unavailable; an availability override is required."] : []),
        ...(capacityExhausted ? ["Mentor capacity has been reached; a capacity override is required."] : []),
        ...(!expertiseMatched ? ["Mentor expertise does not match startup needs; an expertise override is required."] : []),
        ...(sameStartupOtherSlot ? ["The startup already meets this mentor in the other slot; a second-slot override is required."] : []),
        ...(mentorSlotConflict ? ["Mentor is already assigned in the selected slot."] : []),
        ...(startupSlotConflict ? ["Startup is already assigned in the selected slot."] : []),
      ];
      return {
        ...candidate,
        mentor: { ...candidate.mentor, scheduleMentorIds: mentor.scheduleMentorIds },
        eligible: hardConflictTypes.length === 0 && requiredOverrideTypes.length === 0,
        rankingEligible: candidate.eligible,
        hardConflict: hardConflictTypes.length > 0,
        hardConflictTypes,
        requiredOverrideTypes,
        requiresOverrideReason: requiredOverrideTypes.length > 0,
        explanations,
      };
    }),
  };
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

function responseForError(error: unknown): Response {
  let status = 500;
  let code = "internal_error";
  let message = "Unable to process assignment.";
  let field: string | undefined;
  if (error instanceof AuthorizationError) {
    status = error.status;
    code = error.status === 401 ? "unauthenticated" : error.status === 403 ? "forbidden" : "internal_error";
    if (status !== 500) message = error.message;
  } else if (error instanceof AssignmentHttpError) {
    status = error.status;
    code = error.code;
    field = error.field;
    message = error.message;
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
        const replay = await source.findAssignmentReplay?.(input);
        if (replay !== undefined && replay !== null) {
          return Response.json({ data: replay }, { status: 201 });
        }
        const context = buildCandidateContext(input, await source.loadCandidateData(input));
        const candidate = context.candidates.find((item) => item.mentor.scheduleMentorIds.includes(input.mentorSemesterId));
        if (candidate === undefined) {
          throw new AssignmentHttpError(409, "assignment_conflict", "The selected mentor is no longer available for this semester.");
        }
        if (candidate.hardConflict) {
          throw new AssignmentHttpError(409, "assignment_conflict", "The selected mentor or startup is already assigned in this slot.");
        }
        const expectedOverrides = [...candidate.requiredOverrideTypes].sort();
        const submittedOverrides = [...new Set(input.overrideTypes)].sort();
        if (
          expectedOverrides.length !== submittedOverrides.length
          || expectedOverrides.some((override, index) => override !== submittedOverrides[index])
        ) {
          throw new AssignmentHttpError(409, "stale_assignment_context", "Assignment conditions changed. Refresh candidates and review the required overrides.");
        }
        if (expectedOverrides.length > 0 && input.overrideReason === null) {
          throw new AssignmentHttpError(400, "validation_error", "overrideReason is required when overrides are used.", "overrideReason");
        }
        return Response.json({ data: await source.commitAssignment(input) }, { status: 201 });
      } catch (error) {
        return responseForError(error);
      }
    },
  };
}

function checkResult<T extends { error: unknown }>(result: T): void {
  if (result.error !== null) throw new Error(errorMessage(result.error, "Unable to load assignment data."));
}

export function createSupabaseAssignmentDataSource(client: Client): AssignmentDataSource {
  return {
    loadCandidateData: async (input) => {
      const [
        meetingsResult,
        startupResult,
        membershipsResult,
        mentorSemestersResult,
        availabilityResult,
        sessionsResult,
      ] = await Promise.all([
        client.from("meetings").select("id, meeting_date, semester_id").eq("semester_id", input.semesterId),
        client.from("startup_semesters").select("id, semester_id, company_snapshot, goals, mentor_need_context, mentor_need_no_preference, mentorship_needs, stage").eq("id", input.startupSemesterId).eq("semester_id", input.semesterId).maybeSingle(),
        client.from("semester_memberships").select("id, profile_id, semester_id, role, status").eq("semester_id", input.semesterId),
        client.from("mentor_semesters").select("id, semester_membership_id, semester_id, capacity, preferred_format, readiness_status").eq("semester_id", input.semesterId).eq("readiness_status", "ready"),
        client.from("meeting_availability").select("semester_membership_id, meeting_id, slot, is_available").eq("meeting_id", input.meetingId),
        client.from("sessions").select("mentor_semester_id, startup_semester_id, meeting_id, slot, status").eq("semester_id", input.semesterId),
      ]);
      [
        meetingsResult,
        startupResult,
        membershipsResult,
        mentorSemestersResult,
        availabilityResult,
        sessionsResult,
      ].forEach(checkResult);

      const activeMentorMemberships = (membershipsResult.data ?? []).filter((membership) => (
        membership.semester_id === input.semesterId
        && membership.role === "mentor"
        && membership.status === "active"
      ));
      const mentorProfileIds = activeMentorMemberships.map((membership) => membership.profile_id);
      const [profilesResult, mentorProfilesResult] = mentorProfileIds.length === 0
        ? [{ data: [], error: null }, { data: [], error: null }]
        : await Promise.all([
          client.from("profiles").select("id, full_name, email").in("id", mentorProfileIds),
          client.from("mentor_profiles").select("profile_id, expertise_tags").in("profile_id", mentorProfileIds),
        ]);
      checkResult(profilesResult);
      checkResult(mentorProfilesResult);

      const sessionDates = (meetingsResult.data ?? []).map((meeting) => ({
        id: meeting.id,
        semesterId: meeting.semester_id,
        date: meeting.meeting_date,
      }));
      const sessionDate = sessionDates.find((meeting) => meeting.id === input.meetingId) ?? null;
      const membershipById = new Map(activeMentorMemberships.map((membership) => [membership.id, membership]));
      const profileById = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile]));
      const mentorProfileById = new Map((mentorProfilesResult.data ?? []).map((profile) => [profile.profile_id, profile]));
      const mentorSemesterByMembership = new Map((mentorSemestersResult.data ?? []).map((term) => [term.semester_membership_id, term]));
      return {
        sessionDate,
        sessionDates,
        startupScheduleId: input.startupSemesterId,
        startup: startupResult.data === null ? null : {
          id: startupResult.data.id,
          semesterId: startupResult.data.semester_id,
          companySnapshot: startupResult.data.company_snapshot,
          goals: startupResult.data.goals,
          mentorNeedContext: startupResult.data.mentor_need_context,
          mentorNeedNoPreference: startupResult.data.mentor_need_no_preference,
          mentorshipNeeds: startupResult.data.mentorship_needs,
          stage: startupResult.data.stage,
        },
        mentors: activeMentorMemberships.flatMap((membership) => {
          const term = mentorSemesterByMembership.get(membership.id);
          const profile = profileById.get(membership.profile_id);
          const mentorProfile = mentorProfileById.get(membership.profile_id);
          if (term === undefined || profile === undefined || mentorProfile === undefined) return [];
          return [{
            id: term.id,
            scheduleMentorIds: [term.id],
            profileId: membership.profile_id,
            name: profile.full_name ?? profile.email,
            expertise: mentorProfile.expertise_tags,
            preferredFormat: term.preferred_format,
            capacity: term.capacity,
          }];
        }),
        availability: (availabilityResult.data ?? []).flatMap((availability) => {
          const membership = membershipById.get(availability.semester_membership_id);
          if (membership === undefined || (availability.slot !== 1 && availability.slot !== 2)) return [];
          return [{
            profileId: membership.profile_id,
            sessionDateId: availability.meeting_id,
            timeSlot: availability.slot === 1 ? "3:30-4:15" as const : "4:15-5:00" as const,
            isAvailable: availability.is_available,
          }];
        }).filter((availability) => availability.timeSlot === timeSlotFor(input.slot)),
        sessions: (sessionsResult.data ?? []).flatMap((session) => {
          if (session.slot !== 1 && session.slot !== 2) return [];
          return [{
            mentorScheduleId: session.mentor_semester_id,
            startupScheduleId: session.startup_semester_id,
            sessionDateId: session.meeting_id,
            timeSlot: session.slot === 1 ? "3:30-4:15" : "4:15-5:00",
            status: session.status,
          }];
        }),
      };
    },
    findAssignmentReplay: async (input) => {
      const { data, error } = await client
        .from("sessions")
        .select("id")
        .eq("semester_id", input.semesterId)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (error !== null) throw new Error("Unable to verify assignment idempotency.");
      return data === null ? null : { sessionId: data.id, replayed: true };
    },
    commitAssignment: async (input) => await commitAssignment(client as unknown as AssignmentCommitClient, input),
  };
}
