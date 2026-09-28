import { createGoogleCalendarProvider, GoogleCalendarError, holdEventId, type GoogleCalendarProvider } from "./google-provider.ts";
import { GoogleOAuthError, refreshGoogleTokens, type GoogleOAuthConfig } from "./oauth.ts";
import { decryptRefreshToken, encryptRefreshToken, type EncryptedRefreshToken } from "./token-crypto.ts";
import type { CalendarSyncJob } from "./sync-worker.ts";

export interface CalendarHoldJob extends CalendarSyncJob {
  bookingId: string; eventId: string; generation: number;
  desiredState: "present" | "absent"; start: string; end: string;
}
export interface CalendarHoldRepository {
  lease(): Promise<CalendarHoldJob | null>;
  finish(input: {
    jobId: string; leaseToken: string; generation: number; credentialGeneration: number;
    success: boolean; error: string | null; refreshTokenCiphertext: string | null;
    accessTokenCiphertext: string | null; accessExpiresAt: string | null;
  }): Promise<boolean>;
}

/** Each leased job represents one participant's calendar, never an invitation to the other party. */
export async function runCalendarHoldBatch(input: {
  repository: CalendarHoldRepository; encryptionKey: Buffer; oauth: GoogleOAuthConfig;
  limit?: number; now?: () => number; fetch?: typeof fetch; provider?: GoogleCalendarProvider;
}): Promise<{ applied: number; failed: number; superseded: number }> {
  const limit = input.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("Invalid Calendar batch limit");
  const now = input.now ?? Date.now;
  const provider = input.provider ?? createGoogleCalendarProvider({ fetch: input.fetch });
  const counts = { applied: 0, failed: 0, superseded: 0 };
  for (let index = 0; index < limit; index++) {
    const job = await input.repository.lease();
    if (!job) break;
    const context = { profileId: job.profileId, connectionId: job.connectionId };
    let refreshTokenCiphertext: string | null = null, accessTokenCiphertext: string | null = null, accessExpiresAt: string | null = null;
    let success = false, errorCategory: string | null = null;
    let stage: "credentials" | "provider" = "credentials";
    try {
      if (job.eventId !== holdEventId(job.bookingId, job.connectionId) || !["present", "absent"].includes(job.desiredState)) throw new GoogleCalendarError("ownership");
      const decrypt = (ciphertext: string) => decryptRefreshToken(JSON.parse(ciphertext) as EncryptedRefreshToken, input.encryptionKey, context);
      const encrypt = (token: string) => JSON.stringify(encryptRefreshToken(token, input.encryptionKey, context));
      let accessToken: string;
      if (job.accessTokenCiphertext && job.accessExpiresAt && Date.parse(job.accessExpiresAt) > now() + 60_000) {
        accessToken = decrypt(job.accessTokenCiphertext);
      } else {
        const refreshToken = decrypt(job.refreshTokenCiphertext);
        stage = "provider";
        const refreshedAt = now();
        const tokens = await refreshGoogleTokens({ ...input.oauth, refreshToken, fetch: input.fetch });
        accessToken = tokens.accessToken;
        refreshTokenCiphertext = encrypt(tokens.refreshToken);
        accessTokenCiphertext = encrypt(accessToken);
        accessExpiresAt = new Date(refreshedAt + tokens.expiresIn * 1000).toISOString();
      }
      stage = "provider";
      const operation = { accessToken, calendarId: job.calendarId, bookingId: job.bookingId, connectionId: job.connectionId, start: job.start, end: job.end };
      const result = job.desiredState === "present" ? await provider.upsertHold(operation) : await provider.deleteHold(operation);
      if (result.eventId !== job.eventId) throw new GoogleCalendarError("ownership");
      success = true;
    } catch (error) {
      errorCategory = error instanceof GoogleCalendarError || error instanceof GoogleOAuthError ? error.kind : stage === "credentials" ? "credentials" : "retryable";
    }
    const acknowledged = await input.repository.finish({ jobId: job.jobId, leaseToken: job.leaseToken, generation: job.generation, credentialGeneration: job.credentialGeneration, success, error: errorCategory, refreshTokenCiphertext, accessTokenCiphertext, accessExpiresAt });
    if (!acknowledged) counts.superseded++;
    else if (success) counts.applied++;
    else counts.failed++;
  }
  return counts;
}
