import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../db/types.ts";
import { rankMentorCandidates, type MeetingFormat } from "./ranking.ts";

type Client = SupabaseClient<Database>;
export class AssignmentHttpError extends Error {
  readonly status: 400 | 409;
  readonly code: string;
  readonly field: string | undefined;

  constructor(status: 400 | 409, code: string, message: string, field?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}
const uuid = (value: string | null, field: string) => { if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)) throw new AssignmentHttpError(400, "validation_error", `${field} must be a UUID.`, field); return value; };
const candidateSlot = (value: string | null) => { if (value !== "1" && value !== "2") throw new AssignmentHttpError(400, "validation_error", "slot must be 1 or 2.", "slot"); return Number(value) as 1 | 2; };
const canonicalSlot = (value: unknown) => {
  if (value !== 1 && value !== 2) {
    throw new AssignmentHttpError(400, "validation_error", "slot must be 1 or 2.", "slot");
  }
  return value;
};

export function parseCandidateQuery(url: URL) { return { semesterId: uuid(url.searchParams.get("semesterId"), "semesterId"), startupSemesterId: uuid(url.searchParams.get("startupSemesterId"), "startupSemesterId"), meetingId: uuid(url.searchParams.get("meetingId"), "meetingId"), slot: candidateSlot(url.searchParams.get("slot")) }; }
export function parseCommitBody(value: unknown, headers: Headers) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new AssignmentHttpError(400, "invalid_json", "Request body must be a JSON object.");
  const body = value as Record<string, unknown>; const text = (key: string) => typeof body[key] === "string" ? body[key] : null;
  const idempotencyKey = headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) throw new AssignmentHttpError(400, "validation_error", "Idempotency-Key header is required.", "Idempotency-Key");
  const format = text("format"); if (!format) throw new AssignmentHttpError(400, "validation_error", "format is required.", "format");
  return { semesterId: uuid(text("semesterId"), "semesterId"), startupSemesterId: uuid(text("startupSemesterId"), "startupSemesterId"), meetingId: uuid(text("meetingId"), "meetingId"), slot: canonicalSlot(body.slot), mentorSemesterId: uuid(text("mentorSemesterId"), "mentorSemesterId"), idempotencyKey, format, topic: text("topic"), overrideTypes: Array.isArray(body.overrideTypes) && body.overrideTypes.every((x) => typeof x === "string") ? body.overrideTypes : [], overrideReason: text("overrideReason"), rankingContext: body.rankingContext && typeof body.rankingContext === "object" && !Array.isArray(body.rankingContext) ? body.rankingContext as Json : {} };
}
export async function loadAssignmentCandidates(client: Client, input: ReturnType<typeof parseCandidateQuery>) {
  const [{ data: meeting }, { data: startup }, { data: mentorTerms }, { data: availability }, { data: sessions }] = await Promise.all([
    client.from("meetings").select("id, meeting_date, semester_id, slot_1_starts_at, slot_1_ends_at, slot_2_starts_at, slot_2_ends_at").eq("id", input.meetingId).eq("semester_id", input.semesterId).maybeSingle(),
    client.from("startup_semesters").select("id, mentorship_needs").eq("id", input.startupSemesterId).eq("semester_id", input.semesterId).maybeSingle(),
    client.from("mentor_semesters").select("id, semester_membership_id, capacity, preferred_format").eq("semester_id", input.semesterId).eq("readiness_status", "ready"),
    client.from("meeting_availability").select("semester_membership_id, meeting_id, slot, is_available").eq("meeting_id", input.meetingId),
    client.from("sessions").select("mentor_semester_id, slot").eq("semester_id", input.semesterId),
  ]);
  if (!meeting || !startup) throw new AssignmentHttpError(400, "validation_error", "Slot and startup must belong to the selected semester.");
  const membershipIds = (mentorTerms ?? []).map((term) => term.semester_membership_id);
  const { data: memberships } = membershipIds.length === 0
    ? { data: [] }
    : await client.from("semester_memberships").select("id, profile_id").in("id", membershipIds).eq("status", "active");
  const profileIds = (memberships ?? []).map((membership) => membership.profile_id);
  const [{ data: profiles }, { data: mentorProfiles }] = profileIds.length === 0
    ? [{ data: [] }, { data: [] }]
    : await Promise.all([
      client.from("profiles").select("id, full_name, email").in("id", profileIds),
      client.from("mentor_profiles").select("profile_id, expertise_tags").in("profile_id", profileIds),
    ]);
  const membershipById = new Map((memberships ?? []).map((membership) => [membership.id, membership]));
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const mentorProfileById = new Map((mentorProfiles ?? []).map((profile) => [profile.profile_id, profile]));
  const selectedSlot = input.slot;
  const assignedFirst = (sessions ?? []).filter((session) => session.slot === 1).map((session) => session.mentor_semester_id);
  const startsAt = selectedSlot === 1 ? meeting.slot_1_starts_at : meeting.slot_2_starts_at;
  const endsAt = selectedSlot === 1 ? meeting.slot_1_ends_at : meeting.slot_2_ends_at;
  const assignmentSlot = { id: `${input.meetingId}:${input.slot}`, semesterId: input.semesterId, date: meeting.meeting_date, start: startsAt.slice(0, 5), end: endsAt.slice(0, 5), format: "in_person" as MeetingFormat };
  const candidates = (mentorTerms ?? []).flatMap((term) => {
    const membership = membershipById.get(term.semester_membership_id);
    const profile = membership && profileById.get(membership.profile_id);
    const mentorProfile = membership && mentorProfileById.get(membership.profile_id);
    if (!membership || !profile || !mentorProfile) return [];
    return [{ id: term.id, name: profile.full_name ?? profile.email, expertise: mentorProfile.expertise_tags, availability: (availability ?? []).filter((row) => row.semester_membership_id === membership.id && row.slot === selectedSlot && row.is_available).map((row) => row.meeting_id), recentMeetingCount: 0, assignmentLoad: (sessions ?? []).filter((session) => session.mentor_semester_id === term.id).length, formats: [term.preferred_format === "remote" ? "remote" : "in_person"] as MeetingFormat[] }];
  });
  const needs = startup.mentorship_needs;
  return { slot: assignmentSlot, candidates: rankMentorCandidates({ primaryNeed: needs[0] ?? undefined, secondaryNeed: needs[1] ?? undefined, slot: assignmentSlot, excludeMentorIds: input.slot === 2 ? assignedFirst : [], mentors: candidates }) };
}
interface AssignmentCommitClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
}

export async function commitAssignment(client: Client | AssignmentCommitClient, input: ReturnType<typeof parseCommitBody>) {
  type AssignmentCommitRpc = AssignmentCommitClient["rpc"];
  const rpc = client.rpc.bind(client) as unknown as AssignmentCommitRpc;
  const { data, error } = await rpc("commit_mentor_assignment", {
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
  if (error) {
    if (["23505", "40001", "23514"].includes(error.code ?? "")) {
      throw new AssignmentHttpError(409, "assignment_conflict", error.message);
    }
    throw new AssignmentHttpError(400, "validation_error", error.message);
  }
  return data;
}
