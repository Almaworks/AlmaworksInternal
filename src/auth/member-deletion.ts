export interface MemberDeletionPreview {
  profileId: string;
  fullName: string;
  email: string;
  version: string;
  status: "ready" | "in_progress" | "completed";
  counts: Record<string, number>;
  blockers: string[];
  impact: { semesters: string[]; sharedStartups: string[]; upcomingMentorMeetings: string[] };
}

export interface MemberDeletionBody {
  confirmation: "DELETE";
  confirmationEmail: string;
  reason: string;
  version: string;
}

export function parseMemberDeletionBody(value: unknown): MemberDeletionBody {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Request body must be an object.");
  }
  const body = value as Record<string, unknown>;
  if (body.confirmation !== "DELETE") throw new Error("Type DELETE exactly to confirm.");
  if (typeof body.confirmationEmail !== "string" || !body.confirmationEmail.trim() || body.confirmationEmail.length > 320) {
    throw new Error("Target email is required.");
  }
  if (typeof body.reason !== "string" || body.reason.trim().length < 10 || body.reason.length > 500) {
    throw new Error("A deletion reason of 10–500 characters is required.");
  }
  if (typeof body.version !== "string" || !body.version.trim() || body.version.length > 128) {
    throw new Error("A valid preview version is required.");
  }
  return {
    confirmation: "DELETE",
    confirmationEmail: body.confirmationEmail.trim().toLowerCase(),
    reason: body.reason.trim(),
    version: body.version.trim(),
  };
}
