import type { EncryptedRefreshToken } from "../calendar/token-crypto.ts";
import type { GmailConfiguration } from "./config.ts";
import { ALMAWORKS_SUPABASE_URL } from "../calendar/config.ts";

export type GmailAccount = { profile_id: string; connection_id: string; email: string; provider_subject: string; encrypted_token: EncryptedRefreshToken; connected_at: string };
export type GmailTransaction = { state_hash: string; profile_id: string; semester_id: string; encrypted_verifier: EncryptedRefreshToken; expires_at: string; consumed_at: string | null };
export type GmailMessage = { id: string; semester_id: string; opportunity_id: string; profile_id: string; request_key: string; request_digest: string; sender: string; recipient: string; subject: string; body: string; status: "sending" | "sent" | "rejected" | "unknown" | "reviewed"; google_message_id: string | null; google_thread_id: string | null; created_at: string };
export interface GmailStore {
  account(profileId: string): Promise<GmailAccount | null>;
  saveAccount(account: GmailAccount): Promise<void>;
  disconnect(profileId: string): Promise<void>;
  begin(transaction: GmailTransaction): Promise<void>;
  consume(stateHash: string, profileId: string, semesterId: string): Promise<GmailTransaction | null>;
  messages(semesterId: string, opportunityId?: string): Promise<GmailMessage[]>;
  find(profileId: string, requestKey: string): Promise<GmailMessage | null>;
  byId(profileId: string, semesterId: string, messageId: string): Promise<GmailMessage | null>;
  unresolved(profileId: string, opportunityId: string): Promise<GmailMessage | null>;
  review(profileId: string, messageId: string): Promise<boolean>;
  reserve(message: GmailMessage, connectionId: string): Promise<boolean>;
  finish(id: string, result: Pick<GmailMessage, "status" | "google_message_id" | "google_thread_id">): Promise<void>;
}

/** Ordinary authenticated integration identity. Every request remains subject to RLS. */
export async function createGmailStore(config: GmailConfiguration, fetcher: typeof fetch = fetch): Promise<GmailStore> {
  if (config.supabase.url !== ALMAWORKS_SUPABASE_URL) throw new Error("Wrong Supabase project.");
  const headers = { apikey: config.supabase.anonKey, "Content-Type": "application/json" };
  const login = await fetcher(`${config.supabase.url}/auth/v1/token?grant_type=password`, { method: "POST", headers, body: JSON.stringify({ email: config.workerEmail, password: config.workerPassword }), signal: AbortSignal.timeout(10_000), cache: "no-store", redirect: "error" });
  if (!login.ok) throw new Error("Gmail storage is unavailable.");
  const session = await login.json() as { access_token?: string };
  if (!session.access_token) throw new Error("Gmail storage is unavailable.");
  async function rows<T>(path: string, method = "GET", body?: unknown, prefer = "return=representation"): Promise<T[]> {
    const response = await fetcher(`${config.supabase.url}/rest/v1/${path}`, { method, headers: { ...headers, Authorization: `Bearer ${session.access_token}`, Prefer: prefer }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10_000), cache: "no-store", redirect: "error" });
    if (!response.ok) throw new Error("Gmail storage is unavailable. Check deployment before sending.");
    return response.status === 204 ? [] : await response.json() as T[];
  }
  const eq = encodeURIComponent;
  return {
    account: async id => (await rows<GmailAccount>(`outreach_gmail_accounts?profile_id=eq.${eq(id)}`))[0] ?? null,
    saveAccount: async account => { await rows("outreach_gmail_accounts?on_conflict=profile_id", "POST", account, "resolution=merge-duplicates,return=representation"); },
    disconnect: async id => { await rows(`outreach_gmail_oauth?profile_id=eq.${eq(id)}&consumed_at=is.null`, "PATCH", { consumed_at: new Date().toISOString() }); await rows(`outreach_gmail_accounts?profile_id=eq.${eq(id)}`, "DELETE"); },
    begin: async tx => { await rows("outreach_gmail_oauth", "POST", tx); },
    consume: async (hash, id, semester) => (await rows<GmailTransaction>(`outreach_gmail_oauth?state_hash=eq.${eq(hash)}&profile_id=eq.${eq(id)}&semester_id=eq.${eq(semester)}&consumed_at=is.null&expires_at=gt.${eq(new Date().toISOString())}`, "PATCH", { consumed_at: new Date().toISOString() }))[0] ?? null,
    messages: (semester, opportunity) => rows<GmailMessage>(`outreach_gmail_messages?semester_id=eq.${eq(semester)}${opportunity ? `&opportunity_id=eq.${eq(opportunity)}` : ""}&order=created_at.desc&limit=50`),
    find: async (id, key) => (await rows<GmailMessage>(`outreach_gmail_messages?profile_id=eq.${eq(id)}&request_key=eq.${eq(key)}`))[0] ?? null,
    byId: async (id, semester, messageId) => (await rows<GmailMessage>(`outreach_gmail_messages?id=eq.${eq(messageId)}&profile_id=eq.${eq(id)}&semester_id=eq.${eq(semester)}`))[0] ?? null,
    unresolved: async (id, opportunity) => (await rows<GmailMessage>(`outreach_gmail_messages?profile_id=eq.${eq(id)}&opportunity_id=eq.${eq(opportunity)}&status=in.(sending,unknown)&limit=1`))[0] ?? null,
    review: async (id, messageId) => (await rows<GmailMessage>(`outreach_gmail_messages?id=eq.${eq(messageId)}&profile_id=eq.${eq(id)}&status=in.(sending,unknown)&created_at=lt.${eq(new Date(Date.now() - 120_000).toISOString())}`, "PATCH", { status: "reviewed" })).length === 1,
    reserve: async (message, connectionId) => (await rows<GmailMessage>("rpc/reserve_personal_gmail", "POST", { p_message: message, p_connection_id: connectionId })).length === 1,
    finish: async (id, result) => { const updated = await rows(`outreach_gmail_messages?id=eq.${eq(id)}&status=eq.sending`, "PATCH", result); if (updated.length !== 1) throw new Error("Gmail result could not be saved. Check Sent before composing another email."); },
  };
}
