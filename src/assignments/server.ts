import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../db/types.ts";
import { rankMentorCandidates, type MeetingFormat } from "./ranking.ts";

type Client = SupabaseClient<Database>;
export class AssignmentHttpError extends Error { constructor(readonly status: 400 | 409, readonly code: string, message: string, readonly field?: string) { super(message); } }
const uuid = (value: string | null, field: string) => { if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)) throw new AssignmentHttpError(400, "validation_error", `${field} must be a UUID.`, field); return value; };
const slot = (value: string | null) => { if (value !== "3:30-4:15" && value !== "4:15-5:00") throw new AssignmentHttpError(400, "validation_error", "timeSlot is invalid.", "timeSlot"); return value; };

export function parseCandidateQuery(url: URL) { return { semesterId: uuid(url.searchParams.get("semesterId"), "semesterId"), startupSemesterId: uuid(url.searchParams.get("startupSemesterId"), "startupSemesterId"), sessionDateId: uuid(url.searchParams.get("sessionDateId"), "sessionDateId"), timeSlot: slot(url.searchParams.get("timeSlot")) }; }
export function parseCommitBody(value: unknown, headers: Headers) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new AssignmentHttpError(400, "invalid_json", "Request body must be a JSON object.");
  const body = value as Record<string, unknown>; const text = (key: string) => typeof body[key] === "string" ? body[key] : null;
  const idempotencyKey = headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) throw new AssignmentHttpError(400, "validation_error", "Idempotency-Key header is required.", "Idempotency-Key");
  const format = text("format"); if (!format) throw new AssignmentHttpError(400, "validation_error", "format is required.", "format");
  return { semesterId: uuid(text("semesterId"), "semesterId"), startupSemesterId: uuid(text("startupSemesterId"), "startupSemesterId"), sessionDateId: uuid(text("sessionDateId"), "sessionDateId"), timeSlot: slot(text("timeSlot")), mentorProfileId: uuid(text("mentorProfileId"), "mentorProfileId"), idempotencyKey, format, topic: text("topic"), overrideTypes: Array.isArray(body.overrideTypes) && body.overrideTypes.every((x) => typeof x === "string") ? body.overrideTypes : [], overrideReason: text("overrideReason"), rankingContext: body.rankingContext && typeof body.rankingContext === "object" && !Array.isArray(body.rankingContext) ? body.rankingContext as Json : {} };
}
export async function loadAssignmentCandidates(client: Client, input: ReturnType<typeof parseCandidateQuery>) {
  const [{ data: date }, { data: startup }, { data: mentors }, { data: availability }, { data: sessions }] = await Promise.all([
    client.from("session_dates").select("id, date, semester_id").eq("id", input.sessionDateId).eq("semester_id", input.semesterId).maybeSingle(),
    client.from("startup_semesters").select("id, startup_id, mentor_needs").eq("id", input.startupSemesterId).eq("semester_id", input.semesterId).maybeSingle(),
    client.from("mentors").select("id, user_id, full_name, expertise_tags, capacity, preferred_format").eq("semester_id", input.semesterId).eq("is_active", true),
    client.from("availability").select("user_id, session_date_id, is_available").eq("session_date_id", input.sessionDateId),
    client.from("sessions").select("mentor_id, time_slot").eq("semester_id", input.semesterId),
  ]);
  if (!date || !startup) throw new AssignmentHttpError(400, "validation_error", "Slot and startup must belong to the selected semester.");
  const needs = startup.mentor_needs as { primaryNeed?: string; secondaryNeed?: string } | null;
  const assignedFirst = (sessions ?? []).filter((s) => s.time_slot === "3:30-4:15").map((s) => s.mentor_id);
  const assignmentSlot = { id: `${input.sessionDateId}:${input.timeSlot}`, semesterId: input.semesterId, date: date.date, start: input.timeSlot.split("-")[0], end: input.timeSlot.split("-")[1], format: "in_person" as MeetingFormat };
  const candidates = (mentors ?? []).map((mentor) => ({ id: mentor.user_id ?? mentor.id, name: mentor.full_name, expertise: mentor.expertise_tags, availability: (availability ?? []).filter((a) => a.user_id === mentor.user_id && a.is_available).map((a) => a.session_date_id), recentMeetingCount: 0, assignmentLoad: (sessions ?? []).filter((s) => s.mentor_id === mentor.id).length, formats: [mentor.preferred_format === "remote" ? "remote" : "in_person"] as MeetingFormat[] }));
  return { slot: assignmentSlot, candidates: rankMentorCandidates({ primaryNeed: needs?.primaryNeed ?? null, secondaryNeed: needs?.secondaryNeed ?? null, slot: assignmentSlot, excludeMentorIds: input.timeSlot === "4:15-5:00" ? assignedFirst : [], mentors: candidates }) };
}
export async function commitAssignment(client: Client, input: ReturnType<typeof parseCommitBody>) { const { data, error } = await client.rpc("commit_mentor_assignment", { p_semester_id: input.semesterId, p_session_date_id: input.sessionDateId, p_time_slot: input.timeSlot, p_startup_semester_id: input.startupSemesterId, p_mentor_profile_id: input.mentorProfileId, p_idempotency_key: input.idempotencyKey, p_format: input.format, p_topic: input.topic, p_override_types: input.overrideTypes, p_override_reason: input.overrideReason, p_ranking_context: input.rankingContext }); if (error) { if (["23505", "40001", "23514"].includes(error.code ?? "")) throw new AssignmentHttpError(409, "assignment_conflict", error.message); throw new AssignmentHttpError(400, "validation_error", error.message); } return data; }
