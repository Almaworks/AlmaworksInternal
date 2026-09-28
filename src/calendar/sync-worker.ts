import { createGoogleCalendarProvider, GoogleCalendarError, type BusyInterval, type BusyQuery } from "./google-provider.ts";
import { GoogleOAuthError, refreshGoogleTokens, type GoogleOAuthConfig } from "./oauth.ts";
import { decryptRefreshToken, encryptRefreshToken, type EncryptedRefreshToken } from "./token-crypto.ts";

export interface CalendarSyncJob {
  jobId: string; leaseToken: string; profileId: string; connectionId: string;
  credentialGeneration: number;
  calendarId: string; refreshTokenCiphertext: string;
  accessTokenCiphertext: string | null; accessExpiresAt: string | null;
}
export interface CalendarSyncRepository {
  /** Lease one job at a time so queued work cannot expire behind slow provider calls. */
  lease(): Promise<CalendarSyncJob | null>;
  apply(input: {
    jobId: string; leaseToken: string; credentialGeneration: number; coverageStart: string; coverageEnd: string;
    busy: BusyInterval[]; refreshTokenCiphertext: string | null;
    accessTokenCiphertext: string | null; accessExpiresAt: string | null;
  }): Promise<boolean>;
  fail(input: { jobId: string; leaseToken: string; credentialGeneration: number; error: string; refreshTokenCiphertext: string | null; accessTokenCiphertext: string | null; accessExpiresAt: string | null }): Promise<boolean>;
}

/** Server-side batch runner. Database acknowledgements must enforce unexpired leases. */
export async function runCalendarSyncBatch(input: {
  repository: CalendarSyncRepository; encryptionKey: Buffer; oauth: GoogleOAuthConfig;
  limit?: number; now?: () => number; fetch?: typeof fetch;
  queryBusy?: (query: BusyQuery) => Promise<BusyInterval[]>;
}): Promise<{ applied: number; failed: number; superseded: number }> {
  const limit = input.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("Invalid Calendar batch limit");
  const now = input.now ?? Date.now;
  const queryBusy = input.queryBusy ?? createGoogleCalendarProvider({ fetch: input.fetch }).queryBusy;
  const result = { applied: 0, failed: 0, superseded: 0 };
  for (let index = 0; index < limit; index++) {
    const job = await input.repository.lease();
    if (!job) break;
    const context = { profileId: job.profileId, connectionId: job.connectionId };
    let stage: "credentials" | "provider" = "credentials";
    let publication: Parameters<CalendarSyncRepository["apply"]>[0];
    let refreshTokenCiphertext: string | null = null;
    let accessTokenCiphertext: string | null = null;
    let accessExpiresAt: string | null = null;
    try {
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
      // Keep the entire current local day visible, including after UTC rollover.
      // One prior UTC day covers every supported time zone. The 89-day window
      // still includes at least 87 future days, preserving the 85-day import.
      // SQL independently prevents booking past times and applies working hours.
      const start = Math.floor(now() / 86_400_000) * 86_400_000 - 86_400_000;
      const coverageStart = new Date(start).toISOString();
      const coverageEnd = new Date(start + 89 * 86_400_000).toISOString();
      const busy = await queryBusy({ accessToken, calendarId: job.calendarId, from: coverageStart, to: coverageEnd });
      publication = { jobId: job.jobId, leaseToken: job.leaseToken, credentialGeneration: job.credentialGeneration, coverageStart, coverageEnd, busy, refreshTokenCiphertext, accessTokenCiphertext, accessExpiresAt };
    } catch (error) {
      // Never persist provider response bodies, secrets, or arbitrary exception messages.
      const category = error instanceof GoogleCalendarError || error instanceof GoogleOAuthError ? error.kind : stage === "credentials" ? "credentials" : "retryable";
      const acknowledged = await input.repository.fail({ jobId: job.jobId, leaseToken: job.leaseToken, credentialGeneration: job.credentialGeneration, error: category, refreshTokenCiphertext, accessTokenCiphertext, accessExpiresAt });
      if (acknowledged) result.failed++; else result.superseded++;
      continue;
    }
    // Persistence errors propagate: a failed acknowledgement is not a provider failure.
    if (await input.repository.apply(publication)) result.applied++; else result.superseded++;
  }
  return result;
}
