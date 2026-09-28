export type BookingContextAttendance = "attended" | "missed";

export interface BookingContextPerson {
  profileId: string;
  name: string;
  email: string;
}

export interface MentorBookingContext {
  requestId: string;
  semesterId: string;
  viewerProfileId: string;
  persistenceAvailable: boolean;
  permissions: { canEditMeeting: boolean; canRecordOutcome: boolean; canDecline: boolean; canCancel: boolean };
  status: "pending" | "accepted" | "declined" | "cancelled";
  topic: string;
  startsAt: string;
  endsAt: string;
  mentor: BookingContextPerson;
  startup: {
    startupSemesterId: string;
    name: string;
    description: string | null;
    companySnapshot: string | null;
    industry: string | null;
    websiteUrl: string | null;
    goals: string[];
    needs: string[];
    needsContext: string | null;
    team: BookingContextPerson[];
  };
  meeting: { location: string | null; videoUrl: string | null; updatedAt: string } | null;
  decision: { kind: "declined" | "cancelled"; note: string; alternativeText: string | null; authorProfileId: string; createdAt: string } | null;
  outcomes: { reporterProfileId: string; reporterName: string; attendance: BookingContextAttendance; feedback: string | null; updatedAt: string }[];
}

export type BookingContextCommand =
  | { action: "save_meeting"; semesterId: string; requestId: string; location: string | null; videoUrl: string | null; expectedUpdatedAt: string | null }
  | { action: "record_outcome"; semesterId: string; requestId: string; attendance: BookingContextAttendance; feedback: string | null; expectedUpdatedAt: string | null }
  | { action: "transition_with_note"; semesterId: string; requestId: string; transition: "declined" | "cancelled"; note: string; alternativeText: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseBookingContextIds(semesterId: unknown, requestId: unknown): { semesterId: string; requestId: string } {
  if (typeof semesterId !== "string" || !UUID.test(semesterId) || typeof requestId !== "string" || !UUID.test(requestId)) {
    throw new Error("A valid semester and booking request are required.");
  }
  return { semesterId, requestId };
}

function nullableText(value: unknown, maxLength: number, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${field} must be text or null.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`${field} is too long.`);
  return normalized || null;
}

export function parseBookingContextCommand(value: unknown): BookingContextCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A booking context command is required.");
  const body = value as Record<string, unknown>;
  const ids = parseBookingContextIds(body.semesterId, body.requestId);
  if (body.action === "save_meeting") {
    const videoUrl = nullableText(body.videoUrl, 2000, "Video URL");
    if (videoUrl) {
      try { const url = new URL(videoUrl); if (!(["http:", "https:"].includes(url.protocol) && url.hostname && !url.username && !url.password)) throw new Error(); }
      catch { throw new Error("Video URL must be an HTTP or HTTPS link."); }
    }
    if (body.expectedUpdatedAt !== null && (typeof body.expectedUpdatedAt !== "string" || Number.isNaN(Date.parse(body.expectedUpdatedAt)))) throw new Error("Expected update time is invalid.");
    return { action: "save_meeting", ...ids, location: nullableText(body.location, 500, "Location"), videoUrl, expectedUpdatedAt: body.expectedUpdatedAt as string | null };
  }
  if (body.action === "record_outcome") {
    if (body.attendance !== "attended" && body.attendance !== "missed") throw new Error("Attendance must be attended or missed.");
    if (body.expectedUpdatedAt !== null && (typeof body.expectedUpdatedAt !== "string" || Number.isNaN(Date.parse(body.expectedUpdatedAt)))) throw new Error("Expected update time is invalid.");
    return { action: "record_outcome", ...ids, attendance: body.attendance, feedback: nullableText(body.feedback, 2000, "Feedback"), expectedUpdatedAt: body.expectedUpdatedAt as string | null };
  }
  if (body.action === "transition_with_note") {
    if (body.transition !== "declined" && body.transition !== "cancelled") throw new Error("Transition must be declined or cancelled.");
    const note = nullableText(body.note, 2000, "Decision note");
    if (!note) throw new Error("A decision note is required.");
    return { action: "transition_with_note", ...ids, transition: body.transition, note, alternativeText: nullableText(body.alternativeText, 1000, "Alternative") };
  }
  throw new Error("Unknown booking context action.");
}
