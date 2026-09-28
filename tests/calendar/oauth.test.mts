import assert from "node:assert/strict";
import test from "node:test";

import { createGoogleOAuthStart, validateGoogleOAuthCallback, exchangeGoogleCode, refreshGoogleTokens, revokeGoogleToken, getGoogleAccountIdentity, GoogleOAuthError } from "../../src/calendar/oauth.ts";

const config = { clientId: "client-id", clientSecret: "server-secret", callbackUrl: "https://almaworks.example/api/calendar/callback" };
const identity = { profileId: "profile-a", semesterId: "semester-a" };

test("OAuth transaction excludes the authenticated participant's runtime client", () => {
  const userClient: { self?: unknown; credential: string } = { credential: "runtime-only-secret" };
  userClient.self = userClient;
  const actor = { ...identity, role: "mentor", userClient };
  const start = createGoogleOAuthStart(config, actor, 1000);
  const serialized = JSON.stringify(start.transaction);
  assert.doesNotMatch(serialized, /runtime-only-secret|userClient/);
  assert.deepEqual(Object.keys(start.transaction).sort(), ["profileId", "semesterId", "stateDigest", "codeVerifier", "callbackUrl", "expiresAt"].sort());
});

test("OAuth starts offline authorization with PKCE and minimal scoped callback", () => {
  const start = createGoogleOAuthStart(config, identity, 1000);
  const url = new URL(start.authorizationUrl);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("redirect_uri"), config.callbackUrl);
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), start.state);
  assert.deepEqual(url.searchParams.get("scope")?.split(" ").sort(), ["openid", "email", "https://www.googleapis.com/auth/calendar.events.freebusy", "https://www.googleapis.com/auth/calendar.events.owned"].sort());
  assert.equal(start.transaction.expiresAt, 1000 + 10 * 60_000);
  assert.equal(start.authorizationUrl.includes(start.transaction.codeVerifier), false);
});

test("callback rejects mismatched state/profile/semester/callback, expiry, and OAuth denial", () => {
  const start = createGoogleOAuthStart(config, identity, 1000);
  const input = { transaction: start.transaction, state: start.state, code: "code-1", identity, callbackUrl: config.callbackUrl, now: 1001 };
  assert.deepEqual(validateGoogleOAuthCallback(input), { code: "code-1", codeVerifier: start.transaction.codeVerifier });
  for (const change of [
    { state: "wrong" }, { identity: { ...identity, profileId: "other" } }, { identity: { ...identity, semesterId: "other" } },
    { callbackUrl: "https://evil.example/callback" }, { now: start.transaction.expiresAt }, { code: "" }, { error: "access_denied" },
  ]) assert.throws(() => validateGoogleOAuthCallback({ ...input, ...change }), GoogleOAuthError);
});

test("code exchange sends verifier and exact callback; refresh retains old token unless rotated", async () => {
  const sent: URLSearchParams[] = [];
  const fetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
    sent.push(new URLSearchParams(String(init?.body)));
    return new Response(JSON.stringify({ access_token: "access", expires_in: 3600, token_type: "Bearer", scope: "openid email https://www.googleapis.com/auth/calendar.events.freebusy https://www.googleapis.com/auth/calendar.events.owned", ...(sent.length === 1 ? { refresh_token: "refresh" } : {}) }), { status: 200 });
  };
  const exchanged = await exchangeGoogleCode({ ...config, code: "code", codeVerifier: "verifier", fetch });
  assert.equal(exchanged.refreshToken, "refresh");
  assert.equal(sent[0]?.get("redirect_uri"), config.callbackUrl);
  assert.equal(sent[0]?.get("code_verifier"), "verifier");
  const refreshed = await refreshGoogleTokens({ ...config, refreshToken: "refresh", fetch });
  assert.equal(refreshed.refreshToken, "refresh");
  assert.equal(sent[1]?.get("grant_type"), "refresh_token");
});

test("refresh rotation, revocation classification, and revoked token call", async () => {
  const rotated = await refreshGoogleTokens({ ...config, refreshToken: "old", fetch: async () => new Response(JSON.stringify({ access_token: "access", refresh_token: "new", expires_in: 3600, token_type: "Bearer" }), { status: 200 }) });
  assert.equal(rotated.refreshToken, "new");
  await assert.rejects(refreshGoogleTokens({ ...config, refreshToken: "bad", fetch: async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }) }), (e: unknown) => e instanceof GoogleOAuthError && e.kind === "reconnect");
  let payload = "";
  await revokeGoogleToken({ token: "old", fetch: async (_url, init) => { payload = String(init?.body); return new Response(null, { status: 200 }); } });
  assert.equal(new URLSearchParams(payload).get("token"), "old");
});

test("account identity resolves a verified subject with no private profile data", async () => {
  const identity = await getGoogleAccountIdentity({ accessToken: "secret", fetch: async () => new Response(JSON.stringify({ sub: "google-sub-1", email: "owner@example.test", email_verified: true, name: "Private Name", picture: "https://example.test/picture" }), { status: 200 }) });
  assert.deepEqual(identity, { subject: "google-sub-1", email: "owner@example.test" });
  await assert.rejects(getGoogleAccountIdentity({ accessToken: "secret", fetch: async () => new Response(JSON.stringify({ sub: "google-sub-1", email: "owner@example.test", email_verified: false }), { status: 200 }) }), GoogleOAuthError);
});

test("Google canonical email scope is accepted but calendar scopes stay mandatory", async () => {
  const valid = { access_token: "access", refresh_token: "refresh", expires_in: 3600, token_type: "Bearer", scope: "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events.freebusy https://www.googleapis.com/auth/calendar.events.owned" };
  const accepted = await exchangeGoogleCode({ ...config, code: "code", codeVerifier: "verifier", fetch: async () => new Response(JSON.stringify(valid), { status: 200 }) });
  assert.ok(accepted.scopes.includes("email"));
  const missing = { ...valid, scope: "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events.freebusy" };
  await assert.rejects(exchangeGoogleCode({ ...config, code: "code", codeVerifier: "verifier", fetch: async () => new Response(JSON.stringify(missing), { status: 200 }) }), (e: unknown) => e instanceof GoogleOAuthError && e.kind === "invalid");
});

test("null OAuth payloads fail with sanitized errors", async () => {
  const nullResponse = async () => new Response("null", { status: 200 });
  await assert.rejects(exchangeGoogleCode({ ...config, code: "code", codeVerifier: "verifier", fetch: nullResponse }), (e: unknown) => e instanceof GoogleOAuthError && e.kind === "invalid" && !e.message.includes("secret"));
  await assert.rejects(getGoogleAccountIdentity({ accessToken: "secret", fetch: nullResponse }), (e: unknown) => e instanceof GoogleOAuthError && e.kind === "invalid" && !e.message.includes("secret"));
  await assert.rejects(refreshGoogleTokens({ ...config, refreshToken: "refresh", fetch: async () => new Response("null", { status: 400 }) }), (e: unknown) => e instanceof GoogleOAuthError && e.kind === "invalid");
});

test("OAuth fetches have an aborting deadline", async () => {
  let signal: AbortSignal | undefined;
  await assert.rejects(refreshGoogleTokens({ ...config, refreshToken: "refresh", timeoutMilliseconds: 5, fetch: async (_url, init) => {
    signal = init?.signal ?? undefined;
    return await new Promise<Response>(() => {});
  } }), (e: unknown) => e instanceof GoogleOAuthError && e.kind === "retryable");
  assert.equal(signal?.aborted, true);
});
