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
  sessionDateId: string;
  timeSlot: AssignmentTimeSlot;
  format: AssignmentFormat;
}

export interface CommitInput extends CandidateQuery {
  mentorProfileId: string;
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
    preferredExpertiseTags: string[];
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
  availability: Array<{ profileId: string; sessionDateId: string; isAvailable: boolean }>;
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
  commitAssignment(input: CommitInput): Promise<Json>;
}

export interface CandidateContext {
  startup: NonNullable<CandidateSourceData["startup"]>;
  slot: AssignmentSlot;
  candidates: AssignmentCandidate[];
}

export interface AssignmentCandidate extends RankedMentor {
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

function requiredTimeSlot(value: string | null): AssignmentTimeSlot {
  if (value === "3:30-4:15" || value === "4:15-5:00") return value;
  throw new AssignmentHttpError(400, "validation_error", "timeSlot is invalid.", "timeSlot");
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
  return {
    semesterId: requiredUuid(url.searchParams.get("semesterId"), "semesterId"),
    startupSemesterId: requiredUuid(url.searchParams.get("startupSemesterId"), "startupSemesterId"),
    sessionDateId: requiredUuid(url.searchParams.get("sessionDateId"), "sessionDateId"),
    timeSlot: requiredTimeSlot(url.searchParams.get("timeSlot")),
    format: canonicalFormat(url.searchParams.get("format") ?? undefined, "format", true),
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
    format: canonicalFormat(body.format, "format"),
    topic: optionalString(body.topic, "topic"),
    overrideTypes: stringArray(body.overrideTypes, "overrideTypes"),
    overrideReason: optionalString(body.overrideReason, "overrideReason"),
    rankingContext: requiredJsonObject(body.rankingContext, "rankingContext"),
  };
}

function normalizedFormat(value: string | null): MeetingFormat {
  const format = canonicalFormat(value ?? "in_person", "format");
  if (format === "online") return "remote";
  return format;
}

function needsForRanking(startup: NonNullable<CandidateSourceData["startup"]>) {
  const uniqueNeeds = [...startup.preferredExpertiseTags, ...startup.mentorshipNeeds]
    .filter((need, index, needs) => need.trim().length > 0 && needs.indexOf(need) === index);
  return {
    primaryNeed: uniqueNeeds[0] ?? null,
    secondaryNeed: uniqueNeeds[1] ?? null,
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
    || data.startupScheduleId === null
  ) throw staleMapping();

  const [start, end] = input.timeSlot.split("-");
  const slot: AssignmentSlot = {
    id: `${sessionDate.id}:${input.timeSlot}`,
    semesterId: input.semesterId,
    date: sessionDate.date,
    start: start ?? "",
    end: end ?? "",
    format: normalizedFormat(input.format),
  };
  const activeSessions = data.sessions.filter((session) => session.status !== "declined");
  const firstSlotMentorIds = input.timeSlot === "4:15-5:00"
    ? activeSessions.filter((session) => (
      session.sessionDateId === input.sessionDateId
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
    name: mentor.name,
    expertise: mentor.expertise,
    availability: data.availability.some((availability) => (
      availability.profileId === mentor.profileId
      && availability.sessionDateId === input.sessionDateId
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
  const neededExpertise = [...startup.mentorshipNeeds, ...startup.preferredExpertiseTags];
  const startupSlotConflict = activeSessions.some((session) => (
    session.sessionDateId === input.sessionDateId
    && session.timeSlot === input.timeSlot
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
        && availability.sessionDateId === input.sessionDateId
        && !availability.isAvailable
      ));
      const capacityExhausted = activeSessions.filter((session) => mentor.scheduleMentorIds.includes(session.mentorScheduleId)).length >= mentor.capacity;
      const expertiseMatched = neededExpertise.length === 0 || mentor.expertise.some((tag) => neededExpertise.includes(tag));
      const sameStartupOtherSlot = activeSessions.some((session) => (
        mentor.scheduleMentorIds.includes(session.mentorScheduleId)
        && session.startupScheduleId === data.startupScheduleId
        && session.sessionDateId === input.sessionDateId
        && session.timeSlot !== input.timeSlot
      ));
      const mentorSlotConflict = activeSessions.some((session) => (
        mentor.scheduleMentorIds.includes(session.mentorScheduleId)
        && session.sessionDateId === input.sessionDateId
        && session.timeSlot === input.timeSlot
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

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") return error.code;
  return undefined;
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
      const [sessionDatesResult, startupResult, membershipsResult, mentorSemestersResult, scheduleMentorsResult, teamsResult, scheduleStartupsResult, availabilityResult, sessionsResult] = await Promise.all([
        client.from("session_dates").select("id, date, semester_id").eq("semester_id", input.semesterId),
        client.from("startup_semesters").select("id, semester_id, company_snapshot, goals, mentor_need_context, mentor_need_no_preference, mentorship_needs, preferred_expertise_tags, stage").eq("id", input.startupSemesterId).eq("semester_id", input.semesterId).maybeSingle(),
        client.from("semester_memberships").select("id, profile_id, semester_id, role, status").eq("semester_id", input.semesterId),
        client.from("mentor_semesters").select("semester_membership_id, semester_id, capacity, preferred_format").eq("semester_id", input.semesterId),
        client.from("mentors").select("id, user_id, full_name, semester_id, is_active").eq("semester_id", input.semesterId),
        client.from("startup_team_memberships").select("id, startup_semester_id, semester_membership_id, semester_id, is_primary_contact").eq("semester_id", input.semesterId),
        client.from("startups").select("id, user_id, semester_id, is_active").eq("semester_id", input.semesterId).eq("is_active", true),
        client.from("availability").select("user_id, session_date_id, is_available").eq("session_date_id", input.sessionDateId),
        client.from("sessions").select("mentor_id, startup_id, session_date_id, time_slot, status").eq("semester_id", input.semesterId),
      ]);
      [sessionDatesResult, startupResult, membershipsResult, mentorSemestersResult, scheduleMentorsResult, teamsResult, scheduleStartupsResult, availabilityResult, sessionsResult].forEach(checkResult);
      const activeMentorMemberships = (membershipsResult.data ?? []).filter((membership) => (
        membership.semester_id === input.semesterId
        && membership.role === "mentor"
        && membership.status === "active"
      ));
      const activeStartupMemberships = (membershipsResult.data ?? []).filter((membership) => (
        membership.semester_id === input.semesterId
        && membership.role === "startup"
        && membership.status === "active"
      ));
      const mentorProfileIds = activeMentorMemberships.map((membership) => membership.profile_id);
      const mentorProfilesResult = mentorProfileIds.length === 0
        ? { data: [], error: null }
        : await client.from("mentor_profiles").select("profile_id, expertise_tags").in("profile_id", mentorProfileIds);
      checkResult(mentorProfilesResult);
      const sessionDates = (sessionDatesResult.data ?? []).map((date) => ({
        id: date.id,
        semesterId: date.semester_id,
        date: date.date,
      }));
      const sessionDate = sessionDates.find((date) => date.id === input.sessionDateId) ?? null;
      const mentorProfileById = new Map((mentorProfilesResult.data ?? []).map((profile) => [profile.profile_id, profile]));
      const mentorSemesterByMembership = new Map((mentorSemestersResult.data ?? []).map((mentorSemester) => [mentorSemester.semester_membership_id, mentorSemester]));
      const scheduleMentorsByProfile = new Map<string, Array<{ id: string; full_name: string }>>();
      const activeScheduleMentorsByProfile = new Map<string, Array<{ id: string; full_name: string }>>();
      for (const mentor of (scheduleMentorsResult.data ?? [])
        .filter((item) => item.user_id !== null && item.semester_id === input.semesterId)
        .sort((left, right) => left.id.localeCompare(right.id))) {
        const profileId = mentor.user_id;
        if (profileId === null) continue;
        const scheduleMentors = scheduleMentorsByProfile.get(profileId) ?? [];
        scheduleMentors.push({ id: mentor.id, full_name: mentor.full_name });
        scheduleMentorsByProfile.set(profileId, scheduleMentors);
        if (mentor.is_active) {
          const activeScheduleMentors = activeScheduleMentorsByProfile.get(profileId) ?? [];
          activeScheduleMentors.push({ id: mentor.id, full_name: mentor.full_name });
          activeScheduleMentorsByProfile.set(profileId, activeScheduleMentors);
        }
      }
      const startupProfileByMembership = new Map(activeStartupMemberships.map((membership) => [membership.id, membership.profile_id]));
      const activeScheduleStartupsByProfile = new Map(
        (scheduleStartupsResult.data ?? [])
          .filter((startup) => startup.user_id !== null && startup.is_active && startup.semester_id === input.semesterId)
          .sort((left, right) => right.id.localeCompare(left.id))
          .map((startup) => [startup.user_id, startup]),
      );
      const startupScheduleId = (teamsResult.data ?? [])
        .filter((team) => team.semester_id === input.semesterId && team.startup_semester_id === input.startupSemesterId)
        .sort((left, right) => Number(right.is_primary_contact) - Number(left.is_primary_contact) || left.id.localeCompare(right.id))
        .map((team) => startupProfileByMembership.get(team.semester_membership_id))
        .filter((profileId): profileId is string => profileId !== undefined)
        .map((profileId) => activeScheduleStartupsByProfile.get(profileId)?.id)
        .find((id): id is string => id !== undefined) ?? null;
      return {
        sessionDate,
        sessionDates,
        startupScheduleId,
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
        mentors: activeMentorMemberships.flatMap((membership) => {
          const mentorSemester = mentorSemesterByMembership.get(membership.id);
          const mentorProfile = mentorProfileById.get(membership.profile_id);
          const scheduleMentors = scheduleMentorsByProfile.get(membership.profile_id);
          const activeScheduleMentor = activeScheduleMentorsByProfile.get(membership.profile_id)?.[0];
          if (mentorSemester === undefined || mentorProfile === undefined || scheduleMentors === undefined || activeScheduleMentor === undefined) return [];
          return [{
            id: activeScheduleMentor.id,
            scheduleMentorIds: scheduleMentors.map((mentor) => mentor.id),
            profileId: membership.profile_id,
            name: activeScheduleMentor.full_name,
            expertise: mentorProfile.expertise_tags,
            preferredFormat: mentorSemester.preferred_format,
            capacity: mentorSemester.capacity,
          }];
        }),
        availability: (availabilityResult.data ?? []).map((availability) => ({
          profileId: availability.user_id,
          sessionDateId: availability.session_date_id,
          isAvailable: availability.is_available,
        })),
        sessions: (sessionsResult.data ?? []).map((session) => ({
          mentorScheduleId: session.mentor_id,
          startupScheduleId: session.startup_id,
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
        if (["23505", "23514", "40001"].includes(code ?? "")) throw new AssignmentHttpError(409, "assignment_conflict", "Assignment conflicts with the current schedule.");
        if (code === "42501") throw new AssignmentHttpError(403, "forbidden", "Semester administrator access required.");
        if (code === "22023") throw new AssignmentHttpError(400, "validation_error", "Assignment input is invalid.");
        throw new Error("Assignment RPC failed.");
      }
      return data;
    },
  };
}
