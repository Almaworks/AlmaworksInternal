import type { SessionRsvpResponse, SessionRsvpState } from "./rsvp.ts";

export interface SessionParticipantIdentity {
  semesterMembershipId: string;
  fullName: string;
  role: "mentor" | "startup";
}

export interface SessionAttendanceAttendee extends SessionParticipantIdentity {
  response: SessionRsvpState;
}

export interface SessionAttendanceView {
  attendees: SessionAttendanceAttendee[];
  counts: { attending: number; notAttending: number; noResponse: number; total: number };
}

export type MentorRsvpState = "attending" | "cannot_attend" | "pending";
export type StartupRsvpState = "covered" | "unavailable" | "pending";
export type SessionRsvpIssue = "replace_mentor" | "startup_coverage_needed" | "rsvp_pending";

export interface SessionRsvpCoverageState {
  mentor: MentorRsvpState;
  startup: StartupRsvpState;
  issues: SessionRsvpIssue[];
}

export function deriveSessionRsvpState(
  attendees: Array<Pick<SessionAttendanceAttendee, "role" | "response">>,
): SessionRsvpCoverageState {
  const mentor = attendees.find((attendee) => attendee.role === "mentor");
  const startupAttendees = attendees.filter((attendee) => attendee.role === "startup");
  const mentorState: MentorRsvpState = mentor?.response === "attending"
    ? "attending"
    : mentor?.response === "not_attending"
      ? "cannot_attend"
      : "pending";
  const startupState: StartupRsvpState = startupAttendees.some((attendee) => attendee.response === "attending")
    ? "covered"
    : startupAttendees.length > 0 && startupAttendees.every((attendee) => attendee.response === "not_attending")
      ? "unavailable"
      : "pending";
  const issues: SessionRsvpIssue[] = [];
  if (mentorState === "cannot_attend" && startupState === "covered") issues.push("replace_mentor");
  if (mentorState === "attending" && startupState === "unavailable") issues.push("startup_coverage_needed");
  if (mentorState === "pending" || startupState === "pending") issues.push("rsvp_pending");
  return { mentor: mentorState, startup: startupState, issues };
}

export function buildSessionAttendance(input: {
  participants: SessionParticipantIdentity[];
  responses: Array<{ semesterMembershipId: string; response: SessionRsvpResponse }>;
}): SessionAttendanceView {
  const responseByMembership = new Map(input.responses.map((item) => [item.semesterMembershipId, item.response]));
  const attendees = input.participants.map((participant) => ({
    ...participant,
    response: responseByMembership.get(participant.semesterMembershipId) ?? "no_response" as SessionRsvpState,
  }));
  return {
    attendees,
    counts: {
      attending: attendees.filter((attendee) => attendee.response === "attending").length,
      notAttending: attendees.filter((attendee) => attendee.response === "not_attending").length,
      noResponse: attendees.filter((attendee) => attendee.response === "no_response").length,
      total: attendees.length,
    },
  };
}
