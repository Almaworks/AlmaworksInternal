import { calendarSupabaseEnvironment } from "../calendar/config.ts";
import type { GoogleOAuthConfig } from "../calendar/oauth.ts";

export interface GmailConfiguration {
  appOrigin: string;
  oauth: GoogleOAuthConfig;
  encryptionKey: Buffer;
  workerEmail: string;
  workerPassword: string;
  supabase: { url: string; anonKey: string };
}

export function gmailConfiguration(env: Readonly<Record<string, string | undefined>> = process.env): GmailConfiguration | null {
  const supabase = calendarSupabaseEnvironment(env); // Check project before any remote operation.
  if (env.OUTREACH_GMAIL_ENABLED !== "true") return null;
  const appOrigin = env.OUTREACH_GMAIL_APP_ORIGIN;
  const clientId = env.OUTREACH_GMAIL_CLIENT_ID;
  const clientSecret = env.OUTREACH_GMAIL_CLIENT_SECRET;
  const encryption = env.OUTREACH_GMAIL_ENCRYPTION_KEY;
  // Reuse the provisioned ordinary integration identity, never a service-role key.
  const workerEmail = env.CALENDAR_WORKER_EMAIL, workerPassword = env.CALENDAR_WORKER_PASSWORD;
  if (!appOrigin || !clientId || !clientSecret || !encryption || !workerEmail || !workerPassword) return null;
  const origin = new URL(appOrigin);
  if (origin.origin !== appOrigin || origin.username || origin.password || (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)))) throw new Error("Invalid Gmail application origin.");
  const encryptionKey = Buffer.from(encryption, "base64");
  if (encryptionKey.length !== 32 || encryptionKey.toString("base64") !== encryption) throw new Error("Invalid Gmail encryption configuration.");
  return { appOrigin, encryptionKey, workerEmail, workerPassword, supabase, oauth: { clientId, clientSecret, callbackUrl: `${appOrigin}/api/admin/outreach/gmail/callback` } };
}
