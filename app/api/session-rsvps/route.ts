import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { AuthorizationError, requireAuthenticatedUserWithRls } from "@/src/auth/server";
import type { Database } from "@/src/db/types";
import { createSessionRsvpService, SessionRsvpServiceError, type EligibleSessionRsvp, type SessionRsvpRepository } from "@/src/sessions/rsvp-server";
import type { SessionRsvpResponse } from "@/src/sessions/rsvp";

type RlsClient = SupabaseClient<Database>;

function ensure(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function timezoneFrom(configuration: Database["public"]["Tables"]["semesters"]["Row"]["configuration"]): string | null {
  if (!configuration || Array.isArray(configuration) || typeof configuration !== "object") return null;
  const value = (configuration as Record<string, unknown>).timezone;
  return typeof value === "string" ? value : null;
}

function repository(client: RlsClient): SessionRsvpRepository {
  return {
    loadEligibleSession: async (sessionId, profileId): Promise<EligibleSessionRsvp | null> => {
      const sessionResult = await client.from("sessions")
        .select("id,semester_id,meeting_id,mentor_semester_id,startup_semester_id,slot,status")
        .eq("id", sessionId)
        .maybeSingle();
      ensure(sessionResult.error);
      const session = sessionResult.data;
      if (!session) return null;

      const membershipResult = await client.from("semester_memberships")
        .select("id,role,status")
        .eq("semester_id", session.semester_id)
        .eq("profile_id", profileId)
        .in("role", ["mentor", "startup"])
        .in("status", ["onboarding", "active"])
        .maybeSingle();
      ensure(membershipResult.error);
      const membership = membershipResult.data;
      if (!membership) return null;

      if (membership.role === "mentor") {
        const mentorResult = await client.from("mentor_semesters")
          .select("id")
          .eq("id", session.mentor_semester_id)
          .eq("semester_id", session.semester_id)
          .eq("semester_membership_id", membership.id)
          .maybeSingle();
        ensure(mentorResult.error);
        if (!mentorResult.data) return null;
      } else {
        const teamResult = await client.from("startup_team_memberships")
          .select("id")
          .eq("semester_id", session.semester_id)
          .eq("startup_semester_id", session.startup_semester_id)
          .eq("semester_membership_id", membership.id)
          .maybeSingle();
        ensure(teamResult.error);
        if (!teamResult.data) return null;
      }

      const [meetingResult, semesterResult] = await Promise.all([
        client.from("meetings")
          .select("meeting_date,slot_1_starts_at,slot_2_starts_at")
          .eq("id", session.meeting_id)
          .eq("semester_id", session.semester_id)
          .single(),
        client.from("semesters").select("configuration").eq("id", session.semester_id).single(),
      ]);
      ensure(meetingResult.error);
      ensure(semesterResult.error);
      if (!meetingResult.data || !semesterResult.data) throw new Error("Session scheduling details are missing.");
      return {
        semesterId: session.semester_id,
        sessionId: session.id,
        semesterMembershipId: membership.id,
        meetingDate: meetingResult.data.meeting_date,
        startsAt: session.slot === 2 ? meetingResult.data.slot_2_starts_at : meetingResult.data.slot_1_starts_at,
        timezone: timezoneFrom(semesterResult.data.configuration),
        status: session.status,
      };
    },
    saveOwnResponse: async (input) => {
      const existing = await client.from("session_rsvps")
        .select("id")
        .eq("session_id", input.sessionId)
        .eq("semester_membership_id", input.semesterMembershipId)
        .maybeSingle();
      ensure(existing.error);
      const result = existing.data
        ? await client.from("session_rsvps").update({ response: input.response }).eq("id", existing.data.id)
        : await client.from("session_rsvps").insert({
          semester_id: input.semesterId,
          session_id: input.sessionId,
          semester_membership_id: input.semesterMembershipId,
          response: input.response,
        });
      ensure(result.error);
    },
  };
}

function fail(cause: unknown) {
  if (cause instanceof AuthorizationError) return NextResponse.json({ error: cause.message }, { status: cause.status });
  if (cause instanceof SessionRsvpServiceError) {
    const status = cause.code === "validation" ? 422 : cause.code === "locked" ? 409 : 404;
    return NextResponse.json({ error: cause.message }, { status });
  }
  return NextResponse.json({ error: cause instanceof Error ? cause.message : "RSVP could not be saved." }, { status: 500 });
}

export async function PUT(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") throw new SessionRsvpServiceError("validation", "An RSVP payload is required.");
    const candidate = body as Record<string, unknown>;
    const input = {
      sessionId: typeof candidate.sessionId === "string" ? candidate.sessionId : "",
      response: candidate.response as SessionRsvpResponse,
    };
    const auth = await requireAuthenticatedUserWithRls(request);
    await createSessionRsvpService(repository(auth.userClient)).respond(auth.profileId, input);
    return NextResponse.json({ data: { saved: true } });
  } catch (cause) {
    return fail(cause);
  }
}
