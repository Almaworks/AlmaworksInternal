import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const GOOGLE_CALENDAR_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events.freebusy", "https://www.googleapis.com/auth/calendar.events.owned"] as const;
export type GoogleOAuthErrorKind = "reconnect" | "retryable" | "invalid";
export class GoogleOAuthError extends Error {
  readonly kind: GoogleOAuthErrorKind;
  constructor(kind: GoogleOAuthErrorKind) { super(`Google OAuth ${kind}`); this.name = "GoogleOAuthError"; this.kind = kind; }
}
export class GoogleOAuthPermissionsError extends GoogleOAuthError {
  constructor() { super("invalid"); this.name = "GoogleOAuthPermissionsError"; }
}
export interface GoogleOAuthConfig { clientId: string; clientSecret: string; callbackUrl: string }
export interface GoogleOAuthIdentity { profileId: string; semesterId: string }
export interface GoogleOAuthTransaction extends GoogleOAuthIdentity { stateDigest: string; codeVerifier: string; callbackUrl: string; expiresAt: number }
export interface GoogleTokenResult { accessToken: string; refreshToken: string; expiresIn: number; scopes: string[] }

const digest = (value: string) => createHash("sha256").update(value).digest();
const GOOGLE_EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email";
async function bounded<T>(milliseconds: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) throw new GoogleOAuthError("invalid");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new GoogleOAuthError("retryable")); }, milliseconds);
  });
  try { return await Promise.race([operation(controller.signal), deadline]); }
  catch (error) {
    if (error instanceof GoogleOAuthError) throw error;
    throw new GoogleOAuthError("retryable");
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function checkCallback(url: string): void {
  const parsed = new URL(url);
  if ((parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))) || parsed.username || parsed.password || parsed.hash || parsed.search) throw new GoogleOAuthError("invalid");
}

/** Persist transaction server-side, consume it atomically once, then validate against current auth identity. */
export function createGoogleOAuthStart(config: GoogleOAuthConfig, identity: GoogleOAuthIdentity, now = Date.now()): { authorizationUrl: string; state: string; transaction: GoogleOAuthTransaction } {
  checkCallback(config.callbackUrl);
  if (!config.clientId || !identity.profileId || !identity.semesterId) throw new GoogleOAuthError("invalid");
  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(32).toString("base64url");
  const transaction = { profileId: identity.profileId, semesterId: identity.semesterId, stateDigest: digest(state).toString("hex"), codeVerifier, callbackUrl: config.callbackUrl, expiresAt: now + 600_000 };
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  for (const [key, value] of Object.entries({ client_id: config.clientId, redirect_uri: config.callbackUrl, response_type: "code", scope: GOOGLE_CALENDAR_SCOPES.join(" "), access_type: "offline", prompt: "consent", state, code_challenge: digest(codeVerifier).toString("base64url"), code_challenge_method: "S256" })) url.searchParams.set(key, value);
  return { authorizationUrl: url.toString(), state, transaction };
}

export function validateGoogleOAuthCallback(input: { transaction: GoogleOAuthTransaction; state: string; code?: string; error?: string; identity: GoogleOAuthIdentity; callbackUrl: string; now?: number }): { code: string; codeVerifier: string } {
  const { transaction, identity } = input;
  const actual = digest(input.state || "");
  const expected = Buffer.from(transaction.stateDigest, "hex");
  if (input.error || !input.code || expected.length !== actual.length || !timingSafeEqual(expected, actual) || identity.profileId !== transaction.profileId || identity.semesterId !== transaction.semesterId || input.callbackUrl !== transaction.callbackUrl || (input.now ?? Date.now()) >= transaction.expiresAt) throw new GoogleOAuthError("invalid");
  return { code: input.code, codeVerifier: transaction.codeVerifier };
}

async function tokenRequest(form: URLSearchParams, fetcher: typeof fetch, oldRefreshToken?: string, requireRefresh = false, timeoutMilliseconds = 10_000): Promise<GoogleTokenResult> {
  return bounded(timeoutMilliseconds, async (signal) => {
  let response: Response;
  try { response = await fetcher("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString(), cache: "no-store", signal }); }
  catch { throw new GoogleOAuthError("retryable"); }
  if (!response.ok) {
    let error: unknown;
    try { error = (await response.json() as { error?: unknown }).error; } catch { /* no secret-bearing provider detail */ }
    throw new GoogleOAuthError(error === "invalid_grant" ? "reconnect" : response.status === 429 || response.status >= 500 ? "retryable" : "invalid");
  }
  let body: Record<string, unknown>;
  try { body = await response.json() as Record<string, unknown>; } catch { throw new GoogleOAuthError("retryable"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new GoogleOAuthError("invalid");
  if (typeof body.access_token !== "string" || !body.access_token || body.token_type !== "Bearer" || typeof body.expires_in !== "number" || body.expires_in <= 0) throw new GoogleOAuthError("invalid");
  const scopes = typeof body.scope === "string" ? body.scope.split(" ").filter(Boolean) : [];
  if (scopes.includes(GOOGLE_EMAIL_SCOPE) && !scopes.includes("email")) scopes.push("email");
  if (requireRefresh && !GOOGLE_CALENDAR_SCOPES.every((scope) => scopes.includes(scope))) throw new GoogleOAuthPermissionsError();
  if (requireRefresh && (typeof body.refresh_token !== "string" || !body.refresh_token)) throw new GoogleOAuthError("invalid");
  return { accessToken: body.access_token, refreshToken: typeof body.refresh_token === "string" && body.refresh_token ? body.refresh_token : oldRefreshToken ?? "", expiresIn: body.expires_in, scopes };
  });
}

export function exchangeGoogleCode(input: GoogleOAuthConfig & { code: string; codeVerifier: string; fetch?: typeof fetch; timeoutMilliseconds?: number }): Promise<GoogleTokenResult> {
  checkCallback(input.callbackUrl);
  if (!input.code || !input.codeVerifier || !input.clientSecret) throw new GoogleOAuthError("invalid");
  return tokenRequest(new URLSearchParams({ client_id: input.clientId, client_secret: input.clientSecret, code: input.code, code_verifier: input.codeVerifier, redirect_uri: input.callbackUrl, grant_type: "authorization_code" }), input.fetch ?? fetch, undefined, true, input.timeoutMilliseconds);
}

export function refreshGoogleTokens(input: GoogleOAuthConfig & { refreshToken: string; fetch?: typeof fetch; timeoutMilliseconds?: number }): Promise<GoogleTokenResult> {
  if (!input.refreshToken || !input.clientSecret) throw new GoogleOAuthError("invalid");
  return tokenRequest(new URLSearchParams({ client_id: input.clientId, client_secret: input.clientSecret, refresh_token: input.refreshToken, grant_type: "refresh_token" }), input.fetch ?? fetch, input.refreshToken, false, input.timeoutMilliseconds);
}

export async function revokeGoogleToken(input: { token: string; fetch?: typeof fetch; timeoutMilliseconds?: number }): Promise<void> {
  if (!input.token) throw new GoogleOAuthError("invalid");
  return bounded(input.timeoutMilliseconds ?? 10_000, async (signal) => {
  let response: Response;
  try { response = await (input.fetch ?? fetch)("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: input.token }).toString(), cache: "no-store", signal }); }
  catch { throw new GoogleOAuthError("retryable"); }
  if (!response.ok) throw new GoogleOAuthError(response.status === 429 || response.status >= 500 ? "retryable" : "invalid");
  });
}

export async function getGoogleAccountIdentity(input: { accessToken: string; fetch?: typeof fetch; timeoutMilliseconds?: number }): Promise<{ subject: string; email: string }> {
  if (!input.accessToken) throw new GoogleOAuthError("invalid");
  return bounded(input.timeoutMilliseconds ?? 10_000, async (signal) => {
  let response: Response;
  try { response = await (input.fetch ?? fetch)("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${input.accessToken}` }, cache: "no-store", signal }); }
  catch { throw new GoogleOAuthError("retryable"); }
  if (!response.ok) throw new GoogleOAuthError(response.status === 401 || response.status === 403 ? "reconnect" : response.status === 429 || response.status >= 500 ? "retryable" : "invalid");
  let body: Record<string, unknown>;
  try { body = await response.json() as Record<string, unknown>; } catch { throw new GoogleOAuthError("retryable"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new GoogleOAuthError("invalid");
  if (typeof body.sub !== "string" || !body.sub || typeof body.email !== "string" || !body.email || body.email_verified !== true) throw new GoogleOAuthError("invalid");
  return { subject: body.sub, email: body.email };
  });
}
