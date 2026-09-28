import { CalendarHttpError } from "./authorization.ts";
import { ALMAWORKS_SUPABASE_URL, calendarConfiguration, calendarSupabaseEnvironment } from "./config.ts";
import { createCalendarRepositories } from "./repository.ts";
import { runCalendarSyncBatch } from "./sync-worker.ts";

const unavailable = () => new CalendarHttpError(409, "Calendar availability could not be refreshed. Please try this booking again.");

/** Caller must first resolve the participant/mentor scope through authorization. */
export async function syncAuthorizedMentorCalendar(input: {
  semesterId: string; mentorSemesterId: string; fetch?: typeof fetch;
}): Promise<boolean> {
  const config = calendarConfiguration();
  if (!config) return false;
  const repositories = await createCalendarRepositories(config, { fetch: input.fetch, bookingTarget: input });
  const result = await runCalendarSyncBatch({ repository: repositories.sync, encryptionKey: config.encryptionKey, oauth: config.oauth, fetch: input.fetch, limit: 1 });
  return result.applied === 1;
}

/** Refresh failures never fall through to a write using an older snapshot. */
export async function refreshCalendarBeforeBooking(input: {
  required(): Promise<unknown>; refresh(): Promise<boolean>;
}): Promise<void> {
  try {
    const required = await input.required();
    if (typeof required !== "boolean") throw unavailable();
    if (required && !await input.refresh()) throw unavailable();
  } catch (error) {
    if (error instanceof CalendarHttpError) throw error;
    throw unavailable();
  }
}

export async function refreshCalendarForBooking(input: {
  token: string; semesterId: string; mentorSemesterId: string; fetch?: typeof fetch;
}): Promise<void> {
  const environment = calendarSupabaseEnvironment();
  if (environment.url !== ALMAWORKS_SUPABASE_URL || !input.token) throw unavailable();
  const fetcher = input.fetch ?? fetch;
  await refreshCalendarBeforeBooking({
    required: async () => {
      const response = await fetcher(new Request(new URL("/rest/v1/rpc/calendar_booking_refresh_required", environment.url), {
        method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
        headers: { apikey: environment.anonKey, Authorization: `Bearer ${input.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_semester_id: input.semesterId, p_mentor_semester_id: input.mentorSemesterId }),
      }));
      if (!response.ok) throw unavailable();
      return response.json() as Promise<unknown>;
    },
    refresh: async () => {
      const config = calendarConfiguration();
      if (!config) throw new CalendarHttpError(503, "Calendar availability cannot be refreshed until connection setup is complete.");
      return syncAuthorizedMentorCalendar({ ...input, fetch: fetcher });
    },
  });
}
