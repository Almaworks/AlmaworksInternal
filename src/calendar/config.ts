import type { GoogleOAuthConfig } from "./oauth.ts";

export const ALMAWORKS_SUPABASE_URL = "https://layjdjfvxkowxidwuvbs.supabase.co";
type Environment = Readonly<Record<string, string | undefined>>;
/** Deployment flag, independent of provider credentials. Keep enabled after schema rollout. */
export function calendarAvailabilityEnabled(env: Environment = process.env): boolean {
  const value = env.CALENDAR_AVAILABILITY_ENABLED;
  if (value === undefined || value === "false") return false;
  if (value !== "true") throw new Error("Calendar availability deployment configuration is invalid.");
  return true;
}
export interface CalendarConfiguration {
  appOrigin: string;
  oauth: GoogleOAuthConfig;
  encryptionKey: Buffer;
  workerEmail: string;
  workerPassword: string;
  cronSecret: string;
  supabase: { url: string; anonKey: string };
}

/** Enforce the repository's project boundary before constructing any remote client. */
export function calendarSupabaseEnvironment(env: Environment = process.env): CalendarConfiguration["supabase"] {
  if (env.NEXT_PUBLIC_SUPABASE_URL !== ALMAWORKS_SUPABASE_URL) throw new Error("Calendar Supabase project does not match the allowed Almaworks project.");
  if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error("Calendar Supabase public configuration is missing.");
  return { url: ALMAWORKS_SUPABASE_URL, anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
}

/** Server-only secrets. Callers must return an explicit safe status DTO, never this object. */
export function calendarConfiguration(env: Environment = process.env): CalendarConfiguration | null {
  if (env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_URL !== ALMAWORKS_SUPABASE_URL) throw new Error("Calendar Supabase project does not match the allowed Almaworks project.");
  if (!calendarAvailabilityEnabled(env)) return null;
  const appOrigin = env.CALENDAR_APP_ORIGIN;
  const clientId = env.GOOGLE_CALENDAR_CLIENT_ID, clientSecret = env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const encryption = env.GOOGLE_CALENDAR_ENCRYPTION_KEY;
  const workerEmail = env.CALENDAR_WORKER_EMAIL, workerPassword = env.CALENDAR_WORKER_PASSWORD;
  const cronSecret = env.CALENDAR_CRON_SECRET;
  if (!appOrigin || !clientId || !clientSecret || !encryption || !workerEmail || !workerPassword || !cronSecret || !env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  const origin = new URL(appOrigin);
  if (origin.origin !== appOrigin || origin.username || origin.password || (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)))) throw new Error("Calendar application origin must be an HTTPS origin or local development origin.");
  const encryptionKey = Buffer.from(encryption, "base64");
  if (encryptionKey.length !== 32 || encryptionKey.toString("base64") !== encryption) throw new Error("Calendar encryption configuration is invalid.");
  if (cronSecret.length < 32) throw new Error("Calendar worker secret must have at least 32 characters.");
  return {
    appOrigin, oauth: { clientId, clientSecret, callbackUrl: new URL("/api/calendar/callback", appOrigin).toString() },
    encryptionKey, workerEmail, workerPassword, cronSecret, supabase: calendarSupabaseEnvironment(env),
  };
}
