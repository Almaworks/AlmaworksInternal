import { createHash } from "node:crypto";
import type { CalendarConfiguration } from "./config.ts";
import { createGoogleOAuthStart, exchangeGoogleCode, getGoogleAccountIdentity, validateGoogleOAuthCallback, GoogleOAuthError, GoogleOAuthPermissionsError, type GoogleOAuthTransaction } from "./oauth.ts";
import { decryptRefreshToken, encryptRefreshToken, type EncryptedRefreshToken } from "./token-crypto.ts";
import { CalendarHttpError } from "./authorization.ts";

export interface CalendarConnectionActor { profileId: string; semesterId: string; role: "mentor" | "startup"; mentorSemesterId?: string | null }
export type CalendarReturnTarget = "onboarding" | "availability" | "bookings";
export class CalendarCallbackFailure extends CalendarHttpError {
  readonly returnPath:string;
  constructor(status:number,message:string,returnPath:string){super(status,message);this.returnPath=returnPath;}
}
export interface CalendarConnectionRepository {
  beginOAuth(input: { profileId: string; semesterId: string; stateHash: string; verifierCiphertext: string; expiresAt: string }): Promise<void>;
  /** Atomic conditional consumption binds owner and semester; null means expired/used/missing. */
  consumeOAuth(input: { profileId: string; semesterId: string; stateHash: string }): Promise<{ transactionId: string; connectionId: string; verifierCiphertext: string } | null>;
  completeOAuth(input: { transactionId: string; providerSubject: string; accountEmail: string; calendarId: string; refreshTokenCiphertext: string }): Promise<string>;
  /** Expires only this consumed, incomplete transaction; never removes a saved connection. */
  abortOAuth(input: { transactionId: string }): Promise<boolean>;
}
function returnPath(actor: CalendarConnectionActor, target: CalendarReturnTarget): string {
  if (target === "onboarding") return "/dashboard/onboarding?calendar=connected";
  if (target === "availability" && actor.role === "mentor") return "/dashboard/mentor?tab=bookings&calendar=connected";
  if (target === "bookings") return `/dashboard/${actor.role}?tab=bookings&calendar=connected`;
  throw new CalendarHttpError(400, "Invalid Calendar return destination.");
}
const hashState = (state: string) => createHash("sha256").update(state).digest("hex");
export async function beginCalendarConnection(input: {
  actor: CalendarConnectionActor; returnTo: CalendarReturnTarget; config: CalendarConfiguration; repository: CalendarConnectionRepository;
}): Promise<{ authorizationUrl: string }> {
  const path = returnPath(input.actor, input.returnTo);
  const start = createGoogleOAuthStart(input.config.oauth, input.actor);
  const encrypted = encryptRefreshToken(JSON.stringify({ transaction: start.transaction, returnPath: path }), input.config.encryptionKey, { profileId: input.actor.profileId, connectionId: start.transaction.stateDigest });
  await input.repository.beginOAuth({ profileId: input.actor.profileId, semesterId: input.actor.semesterId, stateHash: start.transaction.stateDigest, verifierCiphertext: JSON.stringify(encrypted), expiresAt: new Date(start.transaction.expiresAt).toISOString() });
  return { authorizationUrl: start.authorizationUrl };
}

export async function finishCalendarConnection(input: {
  actor: CalendarConnectionActor; state: string; code?: string; error?: string; config: CalendarConfiguration; repository: CalendarConnectionRepository; fetch?: typeof fetch;
}): Promise<{ connectionId: string; returnPath: string }> {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(input.state)) throw new CalendarHttpError(400, "Calendar connection link expired or already used.");
  const stateHash = hashState(input.state);
  const stored = await input.repository.consumeOAuth({ profileId: input.actor.profileId, semesterId: input.actor.semesterId, stateHash });
  if (!stored) throw new CalendarHttpError(400, "Calendar connection link expired or already used.");
  let verifiedReturnPath:string|null=null;
  let stage: "state" | "exchange" | "identity" | "save" = "state";
  try {
    let transaction: GoogleOAuthTransaction;
    let path: string;
    try {
      const envelope = JSON.parse(stored.verifierCiphertext) as EncryptedRefreshToken;
      const payload = JSON.parse(decryptRefreshToken(envelope, input.config.encryptionKey, { profileId: input.actor.profileId, connectionId: stateHash })) as { transaction: GoogleOAuthTransaction; returnPath: string };
      transaction = payload.transaction;
      path = payload.returnPath;
      const allowed = [returnPath(input.actor, "onboarding"), returnPath(input.actor, "bookings")];
      if (!allowed.includes(path)) throw new Error("Invalid return path");
      verifiedReturnPath=path;
    } catch { throw new CalendarHttpError(400, "Calendar connection link could not be verified. Please reconnect."); }
    if (input.error) throw new CalendarHttpError(400, "Google Calendar connection was declined. You can continue without connecting.");
    const grant = validateGoogleOAuthCallback({ transaction, identity: input.actor, state: input.state, code: input.code, callbackUrl: input.config.oauth.callbackUrl });
    stage = "exchange";
    const tokens = await exchangeGoogleCode({ ...input.config.oauth, ...grant, fetch: input.fetch });
    stage = "identity";
    const google = await getGoogleAccountIdentity({ accessToken: tokens.accessToken, fetch: input.fetch });
    const encrypted = encryptRefreshToken(tokens.refreshToken, input.config.encryptionKey, { profileId: input.actor.profileId, connectionId: stored.connectionId });
    stage = "save";
    const connectionId = await input.repository.completeOAuth({ transactionId: stored.transactionId, providerSubject: google.subject, accountEmail: google.email, calendarId: "primary", refreshTokenCiphertext: JSON.stringify(encrypted) });
    if (connectionId !== stored.connectionId) throw new CalendarHttpError(409, "Calendar connection changed. Please reconnect.");
    return { connectionId, returnPath: path };
  } catch (error) {
    // Fixed categories only: never log codes, tokens, identity or provider bodies.
    console.warn("Calendar callback failed", {stage,category:error instanceof GoogleOAuthError?error.kind:error instanceof CalendarHttpError?"validation":"storage"});
    // Completion may have committed despite a transport failure. The database
    // abort is conditional, so it cannot undo a successfully saved connection.
    try { await input.repository.abortOAuth({ transactionId: stored.transactionId }); }
    catch { /* Expiry bounds the lock if storage is unavailable. Preserve the original error. */ }
    if(verifiedReturnPath){
      const status=error instanceof CalendarHttpError?error.status:503;
      const outcome=input.error?"declined":error instanceof GoogleOAuthPermissionsError?"permissions":status===409?"changed":"failed";
      throw new CalendarCallbackFailure(status,error instanceof CalendarHttpError?error.message:"Google Calendar could not connect. You can continue without connecting.",verifiedReturnPath.replace("calendar=connected",`calendar=${outcome}`));
    }
    throw error;
  }
}
