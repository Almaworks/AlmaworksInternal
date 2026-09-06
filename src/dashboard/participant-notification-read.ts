import {
  selectParticipantContext,
  type ParticipantMembershipInput,
} from "./participant-dashboard.ts";

export interface ParticipantNotificationReadInput {
  semesterId: string;
  notificationKey: string;
}

export interface ParticipantNotificationReadReceipt {
  profileId: string;
  semesterId: string;
  notificationKey: string;
}

export function participantNotificationReadCacheKey(
  profileId: string,
  semesterId: string,
  notificationKey: string,
): string {
  return JSON.stringify([profileId, semesterId, notificationKey]);
}

export interface ParticipantNotificationReadRepository {
  loadContext(profileId: string): Promise<{
    activeSemester: { id: string; name: string } | null;
    memberships: ParticipantMembershipInput[];
  }>;
  recordRead(receipt: ParticipantNotificationReadReceipt): Promise<void>;
}

export class ParticipantNotificationReadError extends Error {
  readonly status: 403 | 422;

  constructor(message: string, status: 403 | 422) {
    super(message);
    this.name = "ParticipantNotificationReadError";
    this.status = status;
  }
}

function requiredTrimmedString(value: unknown, field: string, maxLength?: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ParticipantNotificationReadError(`${field} is required.`, 422);
  }
  const trimmed = value.trim();
  if (maxLength !== undefined && trimmed.length > maxLength) {
    throw new ParticipantNotificationReadError(`${field} is too long.`, 422);
  }
  return trimmed;
}

function parseInput(value: unknown): ParticipantNotificationReadInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ParticipantNotificationReadError("A notification read payload is required.", 422);
  }
  const candidate = value as Record<string, unknown>;
  return {
    semesterId: requiredTrimmedString(candidate.semesterId, "semesterId"),
    notificationKey: requiredTrimmedString(candidate.notificationKey, "notificationKey", 256),
  };
}

export function createParticipantNotificationReadService(
  repository: ParticipantNotificationReadRepository,
) {
  return {
    async record(profileId: string, value: unknown): Promise<{ notificationKey: string }> {
      const input = parseInput(value);
      const snapshot = await repository.loadContext(profileId);
      const context = selectParticipantContext(snapshot);
      if (
        context.kind !== "participant"
        || context.semesterId !== input.semesterId
        || (context.status !== "onboarding" && context.status !== "active")
      ) {
        throw new ParticipantNotificationReadError(
          "An active participant membership is required for this semester.",
          403,
        );
      }
      await repository.recordRead({
        profileId,
        semesterId: context.semesterId,
        notificationKey: input.notificationKey,
      });
      return { notificationKey: input.notificationKey };
    },
  };
}

type NotificationReadFetch = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

interface NotificationReadResponseBody {
  data?: { notificationKey?: unknown };
  error?: unknown;
}

async function responseBody(response: Response): Promise<NotificationReadResponseBody | null> {
  try {
    const body = await response.text();
    if (!body) return null;
    const value: unknown = JSON.parse(body);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as NotificationReadResponseBody;
  } catch {
    return null;
  }
}

export async function persistParticipantNotificationRead(
  request: NotificationReadFetch,
  input: ParticipantNotificationReadInput,
): Promise<void> {
  const response = await request("/api/participant-notifications/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await responseBody(response);
  if (response.ok && payload?.data?.notificationKey === input.notificationKey) return;
  const message = payload?.error;
  throw new Error(
    typeof message === "string" && message.trim()
      ? message
      : "Notification read status could not be saved.",
  );
}
