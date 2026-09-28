import assert from "node:assert/strict";
import test from "node:test";
import { beginCalendarConnection, finishCalendarConnection, type CalendarConnectionRepository } from "../../src/calendar/connection-service.ts";
import { calendarConfiguration } from "../../src/calendar/config.ts";
import { decryptRefreshToken } from "../../src/calendar/token-crypto.ts";
import { GOOGLE_CALENDAR_SCOPES } from "../../src/calendar/oauth.ts";
import { CalendarCallbackFailure } from "../../src/calendar/connection-service.ts";

const config = calendarConfiguration({ CALENDAR_AVAILABILITY_ENABLED: "true", NEXT_PUBLIC_SUPABASE_URL: "https://layjdjfvxkowxidwuvbs.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test", CALENDAR_APP_ORIGIN: "http://localhost:3000", GOOGLE_CALENDAR_CLIENT_ID: "test", GOOGLE_CALENDAR_CLIENT_SECRET: "test", GOOGLE_CALENDAR_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"), CALENDAR_WORKER_EMAIL: "worker@example.invalid", CALENDAR_WORKER_PASSWORD: "test", CALENDAR_CRON_SECRET: "x".repeat(48) })!;
const actor = { profileId: "profile", semesterId: "semester", role: "mentor" as const };
function repository() {
  let saved: Parameters<CalendarConnectionRepository["beginOAuth"]>[0] | undefined;
  let consumed = false;
  const completed: Parameters<CalendarConnectionRepository["completeOAuth"]>[0][] = [];
  const aborted: string[] = [];
  const repo: CalendarConnectionRepository = {
    async abortOAuth(input) { aborted.push(input.transactionId); return true; },
    async beginOAuth(value) { saved = value; },
    async consumeOAuth(value) {
      if (consumed || !saved || saved.stateHash !== value.stateHash || saved.profileId !== value.profileId || saved.semesterId !== value.semesterId) return null;
      consumed = true;
      return { transactionId: "transaction", connectionId: "connection", verifierCiphertext: saved.verifierCiphertext };
    },
    async completeOAuth(value) { completed.push(value); return "connection"; },
  };
  return { repo, completed, aborted, saved: () => saved };
}
test("connection OAuth persists only encrypted state and encrypted refresh credentials", async () => {
  const db = repository(); const calls: string[] = [];
  const begin = await beginCalendarConnection({ actor, returnTo: "onboarding", config, repository: db.repo });
  assert.ok(db.saved()?.verifierCiphertext.startsWith("{"));
  assert.ok(!db.saved()?.verifierCiphertext.includes('codeVerifier'));
  const state = new URL(begin.authorizationUrl).searchParams.get("state")!;
  const done = await finishCalendarConnection({ actor, state, code: "test-code", config, repository: db.repo, fetch: async (url) => {
    calls.push(String(url));
    if (String(url).endsWith("/token")) return Response.json({ access_token: "access-test", refresh_token: "refresh-test", token_type: "Bearer", expires_in: 3600, scope: GOOGLE_CALENDAR_SCOPES.join(" ") });
    return Response.json({ sub: "google-subject", email: "mentor@example.invalid", email_verified: true });
  } });
  assert.equal(done.returnPath, "/dashboard/onboarding?calendar=connected");
  assert.equal(calls.length, 2);
  assert.equal(decryptRefreshToken(JSON.parse(db.completed[0]!.refreshTokenCiphertext), config.encryptionKey, { profileId: actor.profileId, connectionId: "connection" }), "refresh-test");
  assert.ok(!JSON.stringify(done).includes("refresh-test"));
  assert.deepEqual(db.aborted, []);
  await assert.rejects(finishCalendarConnection({ actor, state, code: "test-code", config, repository: db.repo }), /expired|used/i);
});
test("partial Calendar consent explains required permissions without saving a connection", async () => {
  const db = repository();
  const begin = await beginCalendarConnection({ actor, returnTo: "bookings", config, repository: db.repo });
  const state = new URL(begin.authorizationUrl).searchParams.get("state")!;
  let calls = 0;
  await assert.rejects(finishCalendarConnection({ actor, state, code: "test", config, repository: db.repo, fetch: async url => {
    calls++;
    assert.equal(String(url), "https://oauth2.googleapis.com/token");
    return Response.json({ access_token: "access", token_type: "Bearer", expires_in: 3600, scope: "openid email" });
  } }), (error: unknown) => error instanceof CalendarCallbackFailure && error.returnPath === "/dashboard/mentor?tab=bookings&calendar=permissions");
  assert.equal(calls, 1);
  assert.equal(db.completed.length, 0);
  assert.deepEqual(db.aborted, ["transaction"]);
});
test("wrong participant or denied consent never exchanges a code or completes a connection", async () => {
  const db = repository();
  const begin = await beginCalendarConnection({ actor, returnTo: "availability", config, repository: db.repo });
  const state = new URL(begin.authorizationUrl).searchParams.get("state")!;
  const fetcher: typeof fetch = async () => { throw new Error("Must not call Google"); };
  await assert.rejects(finishCalendarConnection({ actor: { ...actor, profileId: "other" }, state, code: "test", config, repository: db.repo, fetch: fetcher }), /expired|used/i);
  await assert.rejects(finishCalendarConnection({ actor, state, error: "access_denied", config, repository: db.repo, fetch: fetcher }),
    (error:unknown)=>error instanceof CalendarCallbackFailure && error.returnPath==="/dashboard/mentor?tab=bookings&calendar=declined" && /declined/i.test(error.message));
  assert.equal(db.completed.length, 0);
  assert.deepEqual(db.aborted, ["transaction"]);
});
test("failed callback releases only its consumed transaction and preserves the original error if cleanup fails", async () => {
  const db = repository();
  const begin = await beginCalendarConnection({actor, returnTo:"onboarding",config,repository:db.repo});
  const state = new URL(begin.authorizationUrl).searchParams.get("state")!;
  db.repo.abortOAuth = async input => { db.aborted.push(input.transactionId); throw new Error("private storage error"); };
  await assert.rejects(finishCalendarConnection({actor,state,error:"access_denied",config,repository:db.repo}), /declined/);
  assert.deepEqual(db.aborted,["transaction"]);
});
test("return destinations are fixed role-aware app paths, not supplied URLs", async () => {
  const db = repository();
  await assert.rejects(beginCalendarConnection({ actor, returnTo: "https://evil.invalid" as "onboarding", config, repository: db.repo }), /destination/i);
  await assert.rejects(beginCalendarConnection({ actor: { ...actor, role: "startup" }, returnTo: "availability", config, repository: db.repo }), /destination/i);
});
test("provider and persistence failures release the consumed callback without revoking Google grants", async () => {
  for(const failure of ["provider","persistence"]){
    const db=repository();
    const begin=await beginCalendarConnection({actor,returnTo:"onboarding",config,repository:db.repo});
    const state=new URL(begin.authorizationUrl).searchParams.get("state")!;
    db.repo.completeOAuth=async()=>{throw new Error("persistence failed");};
    await assert.rejects(finishCalendarConnection({actor,state,code:"code",config,repository:db.repo,fetch:async url=>{
      assert.ok(!String(url).includes("/revoke"));
      if(failure==="provider")return Response.json({}, {status:503});
      if(String(url).endsWith("/token"))return Response.json({access_token:"access",refresh_token:"refresh",token_type:"Bearer",expires_in:3600,scope:GOOGLE_CALENDAR_SCOPES.join(" ")});
      return Response.json({sub:"subject",email:"mentor@example.test",email_verified:true});
    }}));
    assert.deepEqual(db.aborted,["transaction"]);
  }
});
