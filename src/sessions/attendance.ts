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
