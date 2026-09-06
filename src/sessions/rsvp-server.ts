import { canChangeSessionRsvp, sessionStartIso, type SessionRsvpResponse } from "./rsvp.ts";

export interface EligibleSessionRsvp {
  semesterId: string;
  sessionId: string;
  semesterMembershipId: string;
  meetingDate: string;
  startsAt: string;
  timezone: string | null;
  status: string;
}

export interface SessionRsvpRepository {
  loadEligibleSession(sessionId: string, profileId: string): Promise<EligibleSessionRsvp | null>;
  saveOwnResponse(input: {
    semesterId: string;
    sessionId: string;
    semesterMembershipId: string;
    response: SessionRsvpResponse;
  }): Promise<void>;
}

export type SessionRsvpServiceErrorCode = "validation" | "not_found" | "locked";

export class SessionRsvpServiceError extends Error {
  readonly code: SessionRsvpServiceErrorCode;

  constructor(code: SessionRsvpServiceErrorCode, message: string) {
    super(message);
    this.name = "SessionRsvpServiceError";
    this.code = code;
  }
}

export function createSessionRsvpService(
  repository: SessionRsvpRepository,
  now: () => string = () => new Date().toISOString(),
) {
  async function respond(profileId: string, input: { sessionId: string; response: SessionRsvpResponse }): Promise<void> {
    const sessionId = input.sessionId.trim();
    if (!sessionId || (input.response !== "attending" && input.response !== "not_attending")) {
      throw new SessionRsvpServiceError("validation", "sessionId and a valid RSVP response are required.");
    }
    const eligible = await repository.loadEligibleSession(sessionId, profileId);
    if (!eligible) throw new SessionRsvpServiceError("not_found", "Session not found.");
    const sessionStartsAt = sessionStartIso({
      meetingDate: eligible.meetingDate,
      startsAt: eligible.startsAt,
      timezone: eligible.timezone,
    });
    if (!canChangeSessionRsvp({ now: now(), sessionStartsAt, status: eligible.status })) {
      throw new SessionRsvpServiceError("locked", "RSVPs are read-only after the session begins.");
    }
    await repository.saveOwnResponse({
      semesterId: eligible.semesterId,
      sessionId: eligible.sessionId,
      semesterMembershipId: eligible.semesterMembershipId,
      response: input.response,
    });
  }

  return { respond };
}
