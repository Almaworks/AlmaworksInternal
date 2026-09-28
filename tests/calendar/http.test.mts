import assert from "node:assert/strict";
import test from "node:test";
import { handleCalendarConnect, handleCalendarCallback } from "../../src/calendar/http.ts";
import { calendarConfiguration, ALMAWORKS_SUPABASE_URL } from "../../src/calendar/config.ts";
import type { CalendarConnectionRepository } from "../../src/calendar/connection-service.ts";
import { GOOGLE_CALENDAR_SCOPES } from "../../src/calendar/oauth.ts";
import { calendarCallbackNotice } from "../../src/calendar/callback-notice.ts";
const semesterId = "00000000-0000-4000-8000-000000000001";
const config = calendarConfiguration({ CALENDAR_AVAILABILITY_ENABLED: "true", NEXT_PUBLIC_SUPABASE_URL: ALMAWORKS_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: "public", CALENDAR_APP_ORIGIN: "http://localhost:3000", GOOGLE_CALENDAR_CLIENT_ID: "client", GOOGLE_CALENDAR_CLIENT_SECRET: "secret", GOOGLE_CALENDAR_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64"), CALENDAR_WORKER_EMAIL: "worker@example.test", CALENDAR_WORKER_PASSWORD: "password", CALENDAR_CRON_SECRET: "c".repeat(32) })!;
test("connect rejects cross-origin and malformed requests before authentication or storage", async () => {
  let called = false;
  for (const [origin, body] of [["https://evil.test", { semesterId, returnTo: "onboarding" }], [config.appOrigin, { semesterId, returnTo: "https://evil.test" }], [config.appOrigin, { semesterId: "bad", returnTo: "onboarding" }]] as const) {
    const response = await handleCalendarConnect(new Request(`${config.appOrigin}/api/calendar/connect`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }), { config, authorize: async () => { called = true; throw new Error(); }, repository: async () => { called = true; throw new Error(); } });
    assert.ok(response.status >= 400); assert.equal(called, false);
  }
});
test("connect returns OAuth URL with an HttpOnly callback context cookie", async () => {
  let persisted = false;
  const repository: CalendarConnectionRepository = { async abortOAuth() { return true; }, async beginOAuth() { persisted = true; }, async consumeOAuth() { return null; }, async completeOAuth() { throw new Error(); } };
  const response = await handleCalendarConnect(new Request(`${config.appOrigin}/api/calendar/connect`, { method: "POST", headers: { Origin: config.appOrigin, "Content-Type": "application/json" }, body: JSON.stringify({ semesterId, returnTo: "onboarding" }) }), { config, authorize: async () => ({ profileId: "profile", semesterId, role: "mentor" }), repository: async () => repository });
  assert.equal(response.status, 200); assert.equal(persisted, true);
  assert.equal(new URL((await response.json()).authorizationUrl).origin, "https://accounts.google.com");
  assert.match(response.headers.get("set-cookie")!, /HttpOnly/);
  assert.match(response.headers.get("set-cookie")!, /SameSite=Lax/);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("callback without a valid context cookie never consumes OAuth state", async () => {
  const response = await handleCalendarCallback(new Request(`${config.appOrigin}/api/calendar/callback?state=invalid`), { config, authorize: async () => { assert.fail("must not authorize"); }, repository: async () => { assert.fail("must not consume"); } });
  assert.equal(response.status, 400);
});
test("missing configuration leaves optional onboarding available without starting OAuth", async () => {
  const response = await handleCalendarConnect(new Request(`${config.appOrigin}/api/calendar/connect`, { method: "POST" }), { config: null, authorize: async () => { assert.fail(); }, repository: async () => { assert.fail(); } });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /continue without connecting/);
});
test("complete callback consumes owner-bound state once and redirects to the saved onboarding path", async () => {
  let refreshAttempts = 0;
  let saved: Parameters<CalendarConnectionRepository["beginOAuth"]>[0] | null = null;
  let consumed = false;
  const repository: CalendarConnectionRepository = {
    async abortOAuth() { return true; },
    async beginOAuth(value) { saved = value; },
    async consumeOAuth(value) {
      assert.equal(value.profileId, "profile"); assert.equal(value.semesterId, semesterId);
      if (!saved || consumed || value.stateHash !== saved.stateHash) return null;
      consumed = true; return { transactionId: "transaction", connectionId: "connection", verifierCiphertext: saved.verifierCiphertext };
    },
    async completeOAuth() { return "connection"; },
  };
  const dependencies = { config, authorize: async () => ({ profileId: "profile", semesterId, role: "mentor" as const }), repository: async () => repository,
    afterConnect:async()=>{refreshAttempts++;throw new Error("Provider temporarily unavailable");},
    googleFetch: (async input => String(input).includes("/token") ? Response.json({ access_token: "access", refresh_token: "refresh", token_type: "Bearer", expires_in: 3600, scope: GOOGLE_CALENDAR_SCOPES.join(" ") }) : Response.json({ sub: "google-subject", email: "owner@example.test", email_verified: true })) as typeof fetch };
  const start = await handleCalendarConnect(new Request(`${config.appOrigin}/api/calendar/connect`, { method: "POST", headers: { Origin: config.appOrigin, "Content-Type": "application/json" }, body: JSON.stringify({ semesterId, returnTo: "onboarding" }) }), dependencies);
  const state = new URL((await start.json()).authorizationUrl).searchParams.get("state");
  const callback = () => new Request(`${config.appOrigin}/api/calendar/callback?code=google-code&state=${state}`, { headers: { Cookie: `almaworks_calendar_semester=${semesterId}` } });
  const completed = await handleCalendarCallback(callback(), dependencies);
  assert.equal(completed.status, 303);
  assert.equal(refreshAttempts, 1, "saved connections attempt sync even when the provider fails");
  assert.equal(completed.headers.get("location"), `${config.appOrigin}/dashboard/onboarding?calendar=connected`);
  assert.match(completed.headers.get("set-cookie")!, /Max-Age=0/);
  assert.equal((await handleCalendarCallback(callback(), dependencies)).status, 400);
  assert.equal(refreshAttempts, 1, "replayed callbacks must not run another sync");
});

test("declined and failed Google callbacks return to their verified app destination without provider details",async()=>{
  for(const returnTo of ["onboarding","availability","bookings"] as const){
    for(const declined of [true,false]){
      let saved:Parameters<CalendarConnectionRepository["beginOAuth"]>[0]|null=null;
      let aborted=0;
      const repository:CalendarConnectionRepository={
        beginOAuth:async value=>{saved=value;},
        consumeOAuth:async()=>saved?{transactionId:"transaction",connectionId:"connection",verifierCiphertext:saved.verifierCiphertext}:null,
        completeOAuth:async()=>{assert.fail("Failed flow must not save");},
        abortOAuth:async()=>{aborted++;return true;},
      };
      const dependencies={config,authorize:async()=>({profileId:"profile",semesterId,role:"mentor" as const}),repository:async()=>repository,googleFetch:(async()=>Response.json({error:"private provider detail"},{status:503})) as typeof fetch};
      const start=await handleCalendarConnect(new Request(`${config.appOrigin}/api/calendar/connect`,{method:"POST",headers:{Origin:config.appOrigin,"Content-Type":"application/json"},body:JSON.stringify({semesterId,returnTo})}),dependencies);
      const state=new URL((await start.json()).authorizationUrl).searchParams.get("state");
      const result=await handleCalendarCallback(new Request(`${config.appOrigin}/api/calendar/callback?state=${state}&${declined?"error=access_denied&error_description=private":"code=secret-code"}`,{headers:{Cookie:`almaworks_calendar_semester=${semesterId}`}}),dependencies);
      assert.equal(result.status,303);assert.equal(aborted,1);
      const target=new URL(result.headers.get("location")!);
      assert.equal(target.origin,config.appOrigin);
      assert.equal(target.pathname,returnTo==="onboarding"?"/dashboard/onboarding":"/dashboard/mentor");
      assert.equal(target.searchParams.get("calendar"),declined?"declined":"failed");
      assert.ok(!target.href.includes("private")&&!target.href.includes("secret"));
      assert.match(result.headers.get("set-cookie")!,/Max-Age=0/);
    }
  }
});
test("callback notices are fixed optional-flow guidance and never echo arbitrary URL values",()=>{
  assert.match(calendarCallbackNotice("?calendar=permissions")!,/select both Calendar permissions/);
  assert.match(calendarCallbackNotice("?calendar=declined")!,/continue without connecting/);
  assert.match(calendarCallbackNotice("?calendar=failed&error_description=private")!,/try again/);
  assert.match(calendarCallbackNotice("?calendar=changed")!,/disconnect/);
  assert.equal(calendarCallbackNotice("?calendar=connected"),null);
  assert.equal(calendarCallbackNotice("?calendar=private-provider-message"),null);
});
