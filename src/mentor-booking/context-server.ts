import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthorizationError, requireAuthenticatedUserWithRls } from "../auth/server.ts";
import { parseBookingContextCommand, parseBookingContextIds, type MentorBookingContext } from "./context.ts";
import type { Database as ContextDatabase } from "../db/types.ts";

type Client = SupabaseClient<ContextDatabase>;
type DbError = { code?: string; message: string };

class ContextHttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function databaseError(error: DbError): never {
  if (["PGRST205", "PGRST202", "42P01", "42883"].includes(error.code ?? "")) throw new ContextHttpError(503, "Meeting information needs its database update before it can be saved.");
  if (error.code === "42501") throw new ContextHttpError(403, "You do not have access to this booking action.");
  if (["23505", "55000", "40001"].includes(error.code ?? "")) throw new ContextHttpError(409, "Meeting information changed. Refresh and try again.");
  if (["22023", "23514"].includes(error.code ?? "")) throw new ContextHttpError(400, "Meeting information is invalid.");
  throw new ContextHttpError(500, "Meeting information could not be saved or loaded.");
}

function missingContextSchema(error: DbError | null): boolean {
  return !!error && ["PGRST205", "42P01"].includes(error.code ?? "");
}

async function readBooking(client: Client, semesterId: string, requestId: string) {
  const result = await client.from("mentor_booking_requests")
    .select("id,semester_id,status,topic,starts_at,ends_at,mentor_profile_id,mentor_name,startup_semester_id,startup_organization_id,startup_name")
    .eq("semester_id", semesterId).eq("id", requestId).maybeSingle();
  if (result.error) databaseError(result.error);
  if (!result.data) throw new ContextHttpError(404, "This booking is not available.");
  return result.data;
}

async function authorizeAction(client: Client, userId: string, profileId: string, semesterId: string, booking: Awaited<ReturnType<typeof readBooking>>) {
  const [management, membership, team] = await Promise.all([
    client.rpc("can_manage_semester", { target_semester_id: semesterId, candidate_id: userId }),
    client.from("semester_memberships").select("id").eq("semester_id", semesterId).eq("profile_id", profileId).eq("role", "mentor").eq("status", "active").maybeSingle(),
    client.from("startup_team_memberships").select("id,semester_memberships!inner(profile_id,role,status)")
      .eq("semester_id", semesterId).eq("startup_semester_id", booking.startup_semester_id)
      .eq("semester_memberships.profile_id", profileId).eq("semester_memberships.role", "startup")
      .eq("semester_memberships.status", "active").limit(1),
  ]);
  if (management.error) databaseError(management.error);
  if (membership.error) databaseError(membership.error);
  if (team.error) databaseError(team.error);
  const mentor = booking.mentor_profile_id === profileId && !!membership.data;
  const startup = (team.data?.length ?? 0) > 0;
  return { admin: management.data === true, mentor, startup };
}

export async function readMentorBookingContext(request: Request): Promise<MentorBookingContext> {
  const url = new URL(request.url);
  const { semesterId, requestId } = parseBookingContextIds(url.searchParams.get("semesterId"), url.searchParams.get("requestId"));
  const { profileId, userClient, user } = await requireAuthenticatedUserWithRls(request);
  const client = userClient as unknown as Client;
  const booking = await readBooking(client, semesterId, requestId);
  const access = await authorizeAction(client, user.id, profileId, semesterId, booking);
  const [mentorPerson, startupTerm, organization, teamRows, meetingResult, decisionResult, outcomesResult] = await Promise.all([
    client.from("profiles").select("id,full_name,email").eq("id", booking.mentor_profile_id).maybeSingle(),
    client.from("startup_semesters").select("id,company_snapshot,goals,mentorship_needs,mentor_need_context").eq("id", booking.startup_semester_id).eq("semester_id", semesterId).maybeSingle(),
    client.from("startup_organizations").select("name,description,industry,website_url").eq("id", booking.startup_organization_id).maybeSingle(),
    client.from("startup_team_memberships").select("semester_memberships!inner(profile_id,profiles!inner(id,full_name,email))")
      .eq("semester_id", semesterId).eq("startup_semester_id", booking.startup_semester_id)
      .eq("semester_memberships.role", "startup").eq("semester_memberships.status", "active"),
    client.from("mentor_booking_meeting_details").select("location,video_url,updated_at").eq("semester_id", semesterId).eq("request_id", requestId).maybeSingle(),
    client.from("mentor_booking_decision_notes").select("kind,note,alternative_text,author_profile_id,created_at").eq("semester_id", semesterId).eq("request_id", requestId).maybeSingle(),
    client.from("mentor_booking_outcomes").select("reporter_profile_id,attendance,feedback,updated_at").eq("semester_id", semesterId).eq("request_id", requestId).order("created_at"),
  ]);
  for (const result of [mentorPerson, startupTerm, organization, teamRows]) if (result.error) databaseError(result.error);
  for (const result of [meetingResult, decisionResult, outcomesResult]) if (result.error && !missingContextSchema(result.error)) databaseError(result.error);
  const persistenceAvailable = ![meetingResult, decisionResult, outcomesResult].some(result => missingContextSchema(result.error));
  const outcomes = persistenceAvailable ? outcomesResult.data ?? [] : [];
  const outcomeProfiles = outcomes.length ? await client.from("profiles").select("id,full_name").in("id", outcomes.map(row => row.reporter_profile_id)) : { data: [], error: null };
  if (outcomeProfiles.error) databaseError(outcomeProfiles.error);
  const names = new Map((outcomeProfiles.data ?? []).map(row => [row.id, row.full_name ?? "Participant"]));
  const team = (teamRows.data ?? []).flatMap(row => {
    const membership = Array.isArray(row.semester_memberships) ? row.semester_memberships[0] : row.semester_memberships;
    const person = membership?.profiles;
    const profile = Array.isArray(person) ? person[0] : person;
    return profile ? [{ profileId: profile.id, name: profile.full_name ?? "Team member", email: profile.email }] : [];
  });
  const past = new Date(booking.ends_at).getTime() < Date.now();
  return {
    semesterId, requestId, viewerProfileId: profileId, persistenceAvailable,
    permissions: {
      canEditMeeting: persistenceAvailable && booking.status === "accepted" && (access.admin || access.mentor || access.startup),
      canRecordOutcome: persistenceAvailable && booking.status === "accepted" && past && (access.admin || access.mentor || access.startup),
      canDecline: booking.status === "pending" && access.mentor,
      canCancel: ["pending", "accepted"].includes(booking.status) && (access.mentor || access.startup),
    },
    status: booking.status as MentorBookingContext["status"], topic: booking.topic, startsAt: booking.starts_at, endsAt: booking.ends_at,
    mentor: { profileId: booking.mentor_profile_id, name: mentorPerson.data?.full_name ?? booking.mentor_name, email: mentorPerson.data?.email ?? "" },
    startup: {
      startupSemesterId: booking.startup_semester_id, name: organization.data?.name ?? booking.startup_name,
      description: organization.data?.description ?? null, companySnapshot: startupTerm.data?.company_snapshot ?? null,
      industry: organization.data?.industry ?? null,
      websiteUrl: organization.data?.website_url ?? null, goals: startupTerm.data?.goals ?? [],
      needs: startupTerm.data?.mentorship_needs ?? [], needsContext: startupTerm.data?.mentor_need_context ?? null, team,
    },
    meeting: persistenceAvailable && meetingResult.data ? { location: meetingResult.data.location, videoUrl: meetingResult.data.video_url, updatedAt: meetingResult.data.updated_at } : null,
    decision: persistenceAvailable && decisionResult.data ? {
      kind: decisionResult.data.kind as "declined" | "cancelled", note: decisionResult.data.note,
      alternativeText: decisionResult.data.alternative_text, authorProfileId: decisionResult.data.author_profile_id,
      createdAt: decisionResult.data.created_at,
    } : null,
    outcomes: outcomes.map(row => ({ reporterProfileId: row.reporter_profile_id, reporterName: names.get(row.reporter_profile_id) ?? "Participant", attendance: row.attendance as "attended" | "missed", feedback: row.feedback, updatedAt: row.updated_at })),
  };
}

export async function saveMentorBookingContext(request: Request): Promise<void> {
  const command = parseBookingContextCommand(await request.json());
  const { profileId, userClient, user } = await requireAuthenticatedUserWithRls(request);
  const client = userClient as unknown as Client;
  const booking = await readBooking(client, command.semesterId, command.requestId);
  const access = await authorizeAction(client, user.id, profileId, command.semesterId, booking);
  if (command.action === "transition_with_note") {
    if (!(command.transition === "declined" ? access.mentor : access.mentor || access.startup)) throw new ContextHttpError(403, "You cannot make this booking decision.");
    const result = await client.rpc("transition_mentor_booking_with_note", {
      p_semester_id: command.semesterId, p_request_id: command.requestId, p_transition: command.transition,
      p_note: command.note, ...(command.alternativeText ? { p_alternative_text: command.alternativeText } : {}),
    });
    if (result.error) databaseError(result.error);
    return;
  }
  if (command.action === "save_meeting") {
    if (booking.status !== "accepted" || !(access.admin || access.mentor || access.startup)) throw new ContextHttpError(403, "Accepted booking parties and admins can edit meeting details.");
    if (command.expectedUpdatedAt) {
      const result = await client.from("mentor_booking_meeting_details").update({ location: command.location, video_url: command.videoUrl, updated_by_profile_id: profileId, updated_at: new Date().toISOString() })
        .eq("semester_id", command.semesterId).eq("request_id", command.requestId).eq("updated_at", command.expectedUpdatedAt).select("id").maybeSingle();
      if (result.error) databaseError(result.error);
      if (!result.data) throw new ContextHttpError(409, "Meeting details changed. Refresh and try again.");
    } else {
      const result = await client.from("mentor_booking_meeting_details").insert({ semester_id: command.semesterId, request_id: command.requestId, location: command.location, video_url: command.videoUrl, updated_by_profile_id: profileId });
      if (result.error) databaseError(result.error);
    }
    return;
  }
  if (booking.status !== "accepted" || new Date(booking.ends_at).getTime() >= Date.now() || !(access.admin || access.mentor || access.startup)) throw new ContextHttpError(403, "Only participants and admins can report outcomes for accepted past meetings.");
  if (command.expectedUpdatedAt) {
    const result = await client.from("mentor_booking_outcomes").update({ attendance: command.attendance, feedback: command.feedback, updated_at: new Date().toISOString() })
      .eq("semester_id", command.semesterId).eq("request_id", command.requestId).eq("reporter_profile_id", profileId)
      .eq("updated_at", command.expectedUpdatedAt).select("id").maybeSingle();
    if (result.error) databaseError(result.error);
    if (!result.data) throw new ContextHttpError(409, "Your outcome changed. Refresh and try again.");
  } else {
    const result = await client.from("mentor_booking_outcomes").insert({ semester_id: command.semesterId, request_id: command.requestId, reporter_profile_id: profileId, attendance: command.attendance, feedback: command.feedback });
    if (result.error) databaseError(result.error);
  }
}

function response(body: unknown, status = 200) { return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } }); }
function failure(cause: unknown) {
  if (cause instanceof AuthorizationError || cause instanceof ContextHttpError) return response({ error: cause.message }, cause.status);
  if (cause instanceof SyntaxError) return response({ error: "Request body must be valid JSON." }, 400);
  if (cause instanceof Error && /required|invalid|too long|Unknown|must be|decision note/i.test(cause.message)) return response({ error: cause.message }, 400);
  return response({ error: "Meeting information could not be saved or loaded." }, 500);
}

export async function getMentorBookingContext(request: Request) {
  try { return response({ context: await readMentorBookingContext(request) }); }
  catch (cause) { return failure(cause); }
}
export async function postMentorBookingContext(request: Request) {
  try { await saveMentorBookingContext(request); return response({ saved: true }); }
  catch (cause) { return failure(cause); }
}
