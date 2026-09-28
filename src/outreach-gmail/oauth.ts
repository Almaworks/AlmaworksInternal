import { createHash, randomBytes } from "node:crypto";
import { GoogleOAuthError, type GoogleOAuthConfig } from "../calendar/oauth.ts";

export const GMAIL_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.send"] as const;
export function beginGmailOAuth(config: GoogleOAuthConfig) {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  for (const [name, value] of Object.entries({ client_id: config.clientId, redirect_uri: config.callbackUrl, response_type: "code", scope: GMAIL_SCOPES.join(" "), access_type: "offline", prompt: "consent select_account", state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" })) url.searchParams.set(name, value);
  return { state, verifier, authorizationUrl: url.toString(), stateHash: createHash("sha256").update(state).digest("hex") };
}

export async function exchangeGmailCode(config: GoogleOAuthConfig, code: string, verifier: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.callbackUrl, code, code_verifier: verifier, grant_type: "authorization_code" }),
  });
  if (!response.ok) throw new GoogleOAuthError("invalid");
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("access_token" in data) || typeof data.access_token !== "string" || !data.access_token || !("refresh_token" in data) || typeof data.refresh_token !== "string" || !data.refresh_token || !("token_type" in data) || data.token_type !== "Bearer" || !("scope" in data) || typeof data.scope !== "string") throw new GoogleOAuthError("invalid");
  const scopes = data.scope.split(" ");
  if (!scopes.includes(GMAIL_SCOPES[2]) || !scopes.includes("openid") || !(scopes.includes("email") || scopes.includes("https://www.googleapis.com/auth/userinfo.email"))) throw new GoogleOAuthError("invalid");
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}
