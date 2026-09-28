import { createHash, randomUUID } from "node:crypto";
import { getGoogleAccountIdentity, refreshGoogleTokens } from "../calendar/oauth.ts";
import { decryptRefreshToken, encryptRefreshToken } from "../calendar/token-crypto.ts";
import type { GmailConfiguration } from "./config.ts";
import { beginGmailOAuth, exchangeGmailCode } from "./oauth.ts";
import { sendGmailMessage } from "./provider.ts";
import type { GmailMessage, GmailStore } from "./store.ts";

export class GmailError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export const gmailUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export interface GmailActor { profileId: string; semesterId: string }
export interface GmailSendInput { opportunityId: string; requestKey: string; subject: string; body: string; recipient: string; sender: string }
export type ResolveRecipient = () => Promise<{ email: string; ownerProfileId: string | null }>;
const context = (profileId: string, connectionId: string) => ({ profileId: `outreach-gmail:${profileId}`, connectionId });

export async function startConnection(config: GmailConfiguration, store: GmailStore, actor: GmailActor, opportunityId?: string) {
  const start = beginGmailOAuth(config.oauth);
  await store.begin({ state_hash: start.stateHash, profile_id: actor.profileId, semester_id: actor.semesterId, encrypted_verifier: encryptRefreshToken(JSON.stringify({ verifier: start.verifier, opportunityId }), config.encryptionKey, context(actor.profileId, start.stateHash)), expires_at: new Date(Date.now() + 600_000).toISOString(), consumed_at: null });
  return start.authorizationUrl;
}

export async function finishConnection(config: GmailConfiguration, store: GmailStore, actor: GmailActor, state: string, code: string, fetcher: typeof fetch = fetch) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !code) throw new GmailError(400, "The Gmail connection expired. Please connect again.");
  const hash = createHash("sha256").update(state).digest("hex");
  const transaction = await store.consume(hash, actor.profileId, actor.semesterId);
  if (!transaction) throw new GmailError(400, "The Gmail connection expired or was already used. Please connect again.");
  const saved = JSON.parse(decryptRefreshToken(transaction.encrypted_verifier, config.encryptionKey, context(actor.profileId, hash))) as { verifier: string; opportunityId?: string };
  const tokens = await exchangeGmailCode(config.oauth, code, saved.verifier, fetcher);
  const account = await getGoogleAccountIdentity({ accessToken: tokens.accessToken, fetch: fetcher });
  const connectionId = randomUUID();
  await store.saveAccount({ profile_id: actor.profileId, connection_id: connectionId, email: account.email, provider_subject: account.subject, encrypted_token: encryptRefreshToken(tokens.refreshToken, config.encryptionKey, context(actor.profileId, connectionId)), connected_at: new Date().toISOString() });
  return saved.opportunityId;
}

export function validateSendInput(value: unknown): GmailSendInput {
  if (!value || typeof value !== "object") throw new GmailError(400, "Review the email before sending.");
  const v = value as Record<string, unknown>;
  if (!gmailUuid(v.opportunityId) || !gmailUuid(v.requestKey) || typeof v.subject !== "string" || !v.subject.trim() || v.subject.length > 500 || /[\r\n\x00]/.test(v.subject) || typeof v.body !== "string" || !v.body.trim() || v.body.length > 20000 || typeof v.recipient !== "string" || typeof v.sender !== "string" || /{{|}}/.test(v.subject + v.body)) throw new GmailError(400, "Fill all template variables and review the subject and message.");
  if (v.scheduledAt) throw new GmailError(400, "Gmail outreach supports immediate sending only.");
  return { opportunityId: v.opportunityId, requestKey: v.requestKey, subject: v.subject, body: v.body, recipient: v.recipient, sender: v.sender };
}

/** A reservation is never replayed, even after timeout or process death. Gmail has no idempotency key. */
export async function sendPersonalGmail(config: GmailConfiguration, store: GmailStore, actor: GmailActor, input: GmailSendInput, resolveRecipient: ResolveRecipient, fetcher: typeof fetch = fetch): Promise<GmailMessage> {
  const identity = { profileId: actor.profileId, semesterId: actor.semesterId };
  const digest = createHash("sha256").update(JSON.stringify([identity, input.opportunityId, input.subject, input.body, input.recipient, input.sender])).digest("hex");
  const existing = await store.find(actor.profileId, input.requestKey);
  if (existing) {
    if (existing.request_digest !== digest) throw new GmailError(409, "This send request belongs to a different draft. Check its history first.");
    return existing;
  }
  if (await store.unresolved(actor.profileId, input.opportunityId)) throw new GmailError(409, "A previous email needs review. Check Gmail Sent and resolve its history record before sending another email to this contact.");
  const account = await store.account(actor.profileId);
  if (!account) throw new GmailError(409, "Connect your Gmail account first.");
  if (account.email !== input.sender) throw new GmailError(409, "Your connected mailbox changed. Refresh and review the sender before sending.");
  const refreshToken = decryptRefreshToken(account.encrypted_token, config.encryptionKey, context(actor.profileId, account.connection_id));
  const token = await refreshGoogleTokens({ ...config.oauth, refreshToken, fetch: fetcher });
  const googleIdentity = await getGoogleAccountIdentity({ accessToken: token.accessToken, fetch: fetcher });
  if (googleIdentity.subject !== account.provider_subject || googleIdentity.email.toLowerCase() !== account.email.toLowerCase()) throw new GmailError(409, "Your Gmail identity changed. Reconnect before sending.");
  // Fresh user-scoped RLS read, after provider preparation and immediately before claiming.
  const recipient = await resolveRecipient();
  if (recipient.ownerProfileId !== actor.profileId) throw new GmailError(403, "Assign this conversation to yourself in Outreach before sending from your Gmail.");
  if (recipient.email !== input.recipient) throw new GmailError(409, "The contact’s email changed. Refresh and review the recipient.");
  const currentAccount = await store.account(actor.profileId);
  if (currentAccount?.connection_id !== account.connection_id) throw new GmailError(409, "Your Gmail connection changed. Refresh before sending.");
  const message: GmailMessage = { id: randomUUID(), semester_id: actor.semesterId, opportunity_id: input.opportunityId, profile_id: actor.profileId, request_key: input.requestKey, request_digest: digest, sender: account.email, recipient: recipient.email, subject: input.subject, body: input.body, status: "sending", google_message_id: null, google_thread_id: null, created_at: new Date().toISOString() };
  if (!await store.reserve(message, account.connection_id)) {
    const winner = await store.find(actor.profileId, input.requestKey);
    if (!winner || winner.request_digest !== digest) throw new GmailError(409, "This send request is already being processed. Check history.");
    return winner;
  }
  const result = await sendGmailMessage(token.accessToken, { senderEmail: account.email, recipientEmail: recipient.email, subject: input.subject, body: input.body }, { fetch: fetcher });
  const update = result.kind === "accepted" ? { status: "sent" as const, google_message_id: result.messageId, google_thread_id: result.threadId } : { status: result.kind === "rejected" ? "rejected" as const : "unknown" as const, google_message_id: null, google_thread_id: null };
  await store.finish(message.id, update);
  return { ...message, ...update };
}
