import { NextResponse } from "next/server";

import { AuthorizationError, requireSemesterAdmin } from "@/src/auth/server";
import { buildSessionAttendance, deriveSessionRsvpState, type SessionParticipantIdentity } from "@/src/sessions/attendance";
import type { SessionRsvpResponse } from "@/src/sessions/rsvp";

function fail(cause: unknown) {
  if (cause instanceof AuthorizationError) return NextResponse.json({ error: cause.message }, { status: cause.status });
  return NextResponse.json({ error: cause instanceof Error ? cause.message : "Attendance could not be loaded." }, { status: 500 });
}

function ensure(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const semesterId = url.searchParams.get("semesterId")?.trim() ?? "";
    const sessionId = url.searchParams.get("sessionId")?.trim() ?? "";
    if (!semesterId || !sessionId) return NextResponse.json({ error: "semesterId and sessionId are required." }, { status: 422 });
    const { userClient } = await requireSemesterAdmin(request, semesterId);

    const sessionResult = await userClient.from("sessions")
      .select("id,semester_id,mentor_semester_id,startup_semester_id")
      .eq("id", sessionId)
      .eq("semester_id", semesterId)
      .maybeSingle();
    ensure(sessionResult.error);
    if (!sessionResult.data) return NextResponse.json({ error: "Session not found." }, { status: 404 });

    const [mentorResult, teamResult, responseResult] = await Promise.all([
      userClient.from("mentor_semesters").select("semester_membership_id").eq("id", sessionResult.data.mentor_semester_id).eq("semester_id", semesterId).maybeSingle(),
      userClient.from("startup_team_memberships").select("semester_membership_id").eq("startup_semester_id", sessionResult.data.startup_semester_id).eq("semester_id", semesterId),
      userClient.from("session_rsvps").select("semester_membership_id,response").eq("session_id", sessionId).eq("semester_id", semesterId),
    ]);
    ensure(mentorResult.error);
    ensure(teamResult.error);
    ensure(responseResult.error);

    const membershipIds = Array.from(new Set([
      ...(mentorResult.data?.semester_membership_id ? [mentorResult.data.semester_membership_id] : []),
      ...(teamResult.data ?? []).map((item) => item.semester_membership_id),
    ]));
    if (membershipIds.length === 0) {
      const attendance = buildSessionAttendance({ participants: [], responses: [] });
      return NextResponse.json({ data: { ...attendance, rsvpState: deriveSessionRsvpState(attendance.attendees) } });
    }

    const membershipResult = await userClient.from("semester_memberships")
      .select("id,profile_id,role")
      .eq("semester_id", semesterId)
      .in("id", membershipIds);
    ensure(membershipResult.error);
    const profileIds = (membershipResult.data ?? []).map((item) => item.profile_id);
    const profileResult = await userClient.from("profiles").select("id,full_name,email").in("id", profileIds);
    ensure(profileResult.error);
    const profileById = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile]));
    const participants: SessionParticipantIdentity[] = (membershipResult.data ?? [])
      .filter((membership): membership is typeof membership & { role: "mentor" | "startup" } => membership.role === "mentor" || membership.role === "startup")
      .map((membership) => {
        const profile = profileById.get(membership.profile_id);
        return {
          semesterMembershipId: membership.id,
          fullName: profile?.full_name?.trim() || profile?.email || "Unnamed participant",
          role: membership.role,
        };
      });

    const attendance = buildSessionAttendance({
        participants,
        responses: (responseResult.data ?? [])
          .filter((response): response is typeof response & { response: SessionRsvpResponse } => response.response === "attending" || response.response === "not_attending")
          .map((response) => ({
          semesterMembershipId: response.semester_membership_id,
          response: response.response,
          })),
      });
    return NextResponse.json({ data: { ...attendance, rsvpState: deriveSessionRsvpState(attendance.attendees) } });
  } catch (cause) {
    return fail(cause);
  }
}
