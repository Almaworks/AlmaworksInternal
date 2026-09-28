import { ALMAWORKS_SUPABASE_URL } from "./config.ts";
import { CalendarHttpError } from "./http-error.ts";
import type { CalendarConnectionRepository } from "./connection-service.ts";
import type { CalendarSyncRepository } from "./sync-worker.ts";
import type { CalendarHoldRepository } from "./hold-worker.ts";
import type { CalendarDisconnectRepository } from "./disconnect-worker.ts";

type WorkerConfiguration = { supabase: { url: string; anonKey: string }; workerEmail: string; workerPassword: string };
const unavailable = () => new Error("Calendar storage is unavailable. Please try again.");
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw unavailable();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value) throw unavailable();
  return value;
}
function nullableText(value: unknown): string | null { return value === null ? null : text(value); }
function singleRow(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value) || value.length > 1) throw unavailable();
  return value.length ? record(value[0]) : null;
}
function boolean(value: unknown): boolean { if (typeof value !== "boolean") throw unavailable(); return value; }
function generation(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw unavailable();
  return value;
}

/** An ordinary Auth identity, explicitly registered by the database as a Calendar worker.
 * This adapter never uses a service role credential or bypasses database policies.
 */
export async function createCalendarRepositories(config: WorkerConfiguration, options: { fetch?: typeof fetch; timeoutMilliseconds?: number; bookingTarget?: { semesterId: string; mentorSemesterId: string } } = {}): Promise<{ connection: CalendarConnectionRepository; sync: CalendarSyncRepository; holds: CalendarHoldRepository; disconnect: CalendarDisconnectRepository }> {
  if (config.supabase.url !== ALMAWORKS_SUPABASE_URL) throw new Error("Calendar Supabase project does not match the allowed Almaworks project.");
  if (!config.supabase.anonKey || !config.workerEmail || !config.workerPassword) throw unavailable();
  const fetcher = options.fetch ?? fetch;
  const timeout = options.timeoutMilliseconds ?? 10_000;
  if (!Number.isFinite(timeout) || timeout <= 0) throw unavailable();
  async function request(path: string, body: Record<string, unknown>, token?: string): Promise<unknown> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetcher(`${config.supabase.url}${path}`, { method: "POST", cache: "no-store", redirect: "error", signal: controller.signal,
            headers: { apikey: config.supabase.anonKey, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
          if (!response.ok) {
            if (path === "/rest/v1/rpc/calendar_complete_oauth") {
              const failure: unknown = await response.json();
              if (failure && typeof failure === "object" && "code" in failure && failure.code === "PGC01") {
                throw new CalendarHttpError(409, "Disconnect your current Google Calendar and wait for cleanup to finish before connecting a different account.");
              }
            }
            if (path === "/rest/v1/rpc/calendar_begin_oauth") {
              const failure: unknown = await response.json();
              if (failure && typeof failure === "object" && "code" in failure && failure.code === "PGC02") {
                throw new CalendarHttpError(409, "Your Google Calendar connection is still finishing. Please wait before trying again.");
              }
            }
            throw unavailable();
          }
          return await response.json() as unknown;
        })(),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(unavailable()); }, timeout); }),
      ]);
    } catch (error) { if (error instanceof CalendarHttpError) throw error; throw unavailable(); }
    finally { if (timer) clearTimeout(timer); }
  }
  const session = record(await request("/auth/v1/token?grant_type=password", { email: config.workerEmail, password: config.workerPassword }));
  if (typeof session.token_type !== "string" || session.token_type.toLowerCase() !== "bearer") throw unavailable();
  const token = text(session.access_token);
  const rpc = (name: string, body: Record<string, unknown>) => request(`/rest/v1/rpc/${name}`, body, token);
  return {
    disconnect: {
      async lease(){
        const row=singleRow(await rpc("calendar_lease_disconnect_jobs",{p_limit:1}));
        return row?{connectionId:text(row.connection_id),leaseToken:text(row.lease_token),credentialGeneration:generation(row.credential_generation)}:null;
      },
      async finish(input){return boolean(await rpc("calendar_finish_disconnect_job",{p_connection_id:input.connectionId,p_lease_token:input.leaseToken,p_credential_generation:input.credentialGeneration}));},
    },
    holds: {
      async lease() {
        const row = singleRow(await rpc("calendar_lease_hold_jobs", { p_limit: 1 }));
        if (!row) return null;
        if (row.desired_state !== "present" && row.desired_state !== "absent") throw unavailable();
        return { jobId: text(row.job_id), leaseToken: text(row.lease_token), bookingId: text(row.request_id), eventId: text(row.event_id), generation: generation(row.generation), credentialGeneration: generation(row.credential_generation), profileId: text(row.profile_id), connectionId: text(row.connection_id), calendarId: text(row.calendar_id), desiredState: row.desired_state, start: text(row.starts_at), end: text(row.ends_at), refreshTokenCiphertext: text(row.refresh_token_ciphertext), accessTokenCiphertext: nullableText(row.access_token_ciphertext), accessExpiresAt: nullableText(row.access_expires_at) };
      },
      async finish(input) {
        return boolean(await rpc("calendar_finish_hold_job", { p_job_id: input.jobId, p_lease_token: input.leaseToken, p_generation: input.generation, p_credential_generation: input.credentialGeneration, p_success: input.success, p_error: input.error, p_refresh_token_ciphertext: input.refreshTokenCiphertext, p_access_token_ciphertext: input.accessTokenCiphertext, p_access_expires_at: input.accessExpiresAt }));
      },
    },
    connection: {
      async abortOAuth(input) {
        return boolean(await rpc("calendar_abort_oauth", { p_transaction_id: input.transactionId }));
      },
      async beginOAuth(input) {
        const row = singleRow(await rpc("calendar_begin_oauth", { p_profile_id: input.profileId, p_semester_id: input.semesterId, p_state_hash: input.stateHash, p_verifier_ciphertext: input.verifierCiphertext, p_expires_at: input.expiresAt }));
        if (!row) throw unavailable(); text(row.transaction_id); text(row.connection_id);
      },
      async consumeOAuth(input) {
        const row = singleRow(await rpc("calendar_consume_oauth", { p_profile_id: input.profileId, p_semester_id: input.semesterId, p_state_hash: input.stateHash }));
        return row ? { transactionId: text(row.transaction_id), connectionId: text(row.connection_id), verifierCiphertext: text(row.verifier_ciphertext) } : null;
      },
      async completeOAuth(input) {
        return text(await rpc("calendar_complete_oauth", { p_transaction_id: input.transactionId, p_provider_subject: input.providerSubject, p_account_email: input.accountEmail, p_calendar_id: input.calendarId, p_refresh_token_ciphertext: input.refreshTokenCiphertext, p_access_token_ciphertext: null, p_access_expires_at: null }));
      },
    },
    sync: {
      async lease() {
        const row = singleRow(await (options.bookingTarget
          ? rpc("calendar_lease_booking_sync", { p_semester_id: options.bookingTarget.semesterId, p_mentor_semester_id: options.bookingTarget.mentorSemesterId })
          : rpc("calendar_lease_sync_jobs", { p_limit: 1 })));
        return row ? { jobId: text(row.job_id), leaseToken: text(row.lease_token), credentialGeneration: generation(row.credential_generation), profileId: text(row.profile_id), connectionId: text(row.connection_id), calendarId: text(row.calendar_id), refreshTokenCiphertext: text(row.refresh_token_ciphertext), accessTokenCiphertext: nullableText(row.access_token_ciphertext), accessExpiresAt: nullableText(row.access_expires_at) } : null;
      },
      async apply(input) {
        return boolean(await rpc("calendar_apply_sync_result", { p_job_id: input.jobId, p_lease_token: input.leaseToken, p_credential_generation: input.credentialGeneration, p_coverage_start: input.coverageStart, p_coverage_end: input.coverageEnd, p_busy: input.busy.map(interval => ({ starts_at: interval.start, ends_at: interval.end })), p_refresh_token_ciphertext: input.refreshTokenCiphertext, p_access_token_ciphertext: input.accessTokenCiphertext, p_access_expires_at: input.accessExpiresAt }));
      },
      async fail(input) { return boolean(await rpc("calendar_finish_sync_job", { p_job_id: input.jobId, p_lease_token: input.leaseToken, p_credential_generation: input.credentialGeneration, p_success: false, p_error: input.error, p_refresh_token_ciphertext: input.refreshTokenCiphertext, p_access_token_ciphertext: input.accessTokenCiphertext, p_access_expires_at: input.accessExpiresAt })); },
    },
  };
}
