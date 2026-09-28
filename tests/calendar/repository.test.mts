import assert from "node:assert/strict";
import test from "node:test";

test("booking refresh leases only its target while preserving credential fencing", async () => {
  const source = setup((name, body) => {
    assert.equal(name, "calendar_lease_booking_sync");
    assert.deepEqual(body, { p_semester_id: "semester", p_mentor_semester_id: "mentor" });
    return [{ job_id: "job", lease_token: "lease", credential_generation: 7, profile_id: "profile",
      connection_id: "connection", calendar_id: "primary", refresh_token_ciphertext: "ciphertext",
      access_token_ciphertext: null, access_expires_at: null }];
  });
  const repositories = await createCalendarRepositories(config, { fetch: source.fetcher, bookingTarget: { semesterId: "semester", mentorSemesterId: "mentor" } });
  const job = await repositories.sync.lease();
  assert.equal(job?.jobId, "job");
  assert.equal(job?.credentialGeneration, 7);
});
import { createCalendarRepositories } from "../../src/calendar/repository.ts";
import { ALMAWORKS_SUPABASE_URL } from "../../src/calendar/config.ts";
import { CalendarHttpError } from "../../src/calendar/authorization.ts";

test("account replacement conflict gives safe disconnect guidance only for OAuth completion", async () => {
  const repositories = await createCalendarRepositories(config, { fetch: async (url) => {
    if (String(url).includes("/auth/v1/token")) return Response.json({access_token:"worker-token",token_type:"bearer"});
    return Response.json({code:"PGC01",message:"private provider identity must not escape",details:"secret"},{status:400});
  }});
  await assert.rejects(repositories.connection.completeOAuth({transactionId:"transaction",providerSubject:"other",accountEmail:"other@example.test",calendarId:"primary",refreshTokenCiphertext:"encrypted"}),
    (error:unknown)=>error instanceof CalendarHttpError && error.status===409 && /Disconnect your current Google Calendar/.test(error.message) && !/private|secret/.test(error.message));
  await assert.rejects(repositories.sync.lease(), (error:unknown)=>error instanceof Error && !(error instanceof CalendarHttpError) && !/private|secret/.test(error.message));
});

const config = { supabase: { url: ALMAWORKS_SUPABASE_URL, anonKey: "public-key" }, workerEmail: "worker@example.test", workerPassword: "test-password" };
test("OAuth abort is transaction-bound and preserves no-op acknowledgements", async () => {
  const source=setup((name,body)=>{
    assert.equal(name,"calendar_abort_oauth");
    assert.deepEqual(body,{p_transaction_id:"failed-transaction"});
    return false;
  });
  const {connection}=await createCalendarRepositories(config,{fetch:source.fetcher});
  assert.equal(await connection.abortOAuth({transactionId:"failed-transaction"}),false);
});
test("in-flight callback conflicts tell the participant to wait without exposing storage details", async () => {
  const {connection}=await createCalendarRepositories(config,{fetch:async url=>{
    if(String(url).includes("/auth/v1/token"))return Response.json({access_token:"token",token_type:"bearer"});
    return Response.json({code:"PGC02",message:"private database details"},{status:400});
  }});
  await assert.rejects(connection.beginOAuth({profileId:"profile",semesterId:"semester",stateHash:"hash",verifierCiphertext:"encrypted",expiresAt:"expiry"}),
    (error:unknown)=>error instanceof CalendarHttpError && error.status===409 && /still finishing/.test(error.message) && !/private/.test(error.message));
});
test("disconnect repository preserves lease and credential fences using the ordinary worker bearer",async()=>{
  const source=setup((name,body)=>{
    if(name==="calendar_lease_disconnect_jobs")return [{connection_id:"connection",lease_token:"lease",credential_generation:3}];
    assert.equal(name,"calendar_finish_disconnect_job");
    assert.deepEqual(body,{p_connection_id:"connection",p_lease_token:"lease",p_credential_generation:3});
    return true;
  });
  const {disconnect}=await createCalendarRepositories(config,{fetch:source.fetcher});
  assert.deepEqual(await disconnect.lease(),{connectionId:"connection",leaseToken:"lease",credentialGeneration:3});
  assert.equal(await disconnect.finish({connectionId:"connection",leaseToken:"lease",credentialGeneration:3}),true);
});
function setup(reply: (name: string, body: Record<string, unknown>) => unknown) {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init); const url = new URL(request.url);
    assert.equal(url.origin, ALMAWORKS_SUPABASE_URL);
    if (url.pathname === "/auth/v1/token") return Response.json({ access_token: "worker-token", token_type: "bearer", expires_in: 3600, refresh_token: "unused", user: { id: "worker-id" } });
    assert.equal(request.headers.get("Authorization"), "Bearer worker-token");
    assert.equal(request.headers.get("apikey"), "public-key");
    const name = url.pathname.split("/").at(-1)!; calls.push(name);
    return Response.json(reply(name, await request.json()));
  };
  return { fetcher, calls };
}
test("OAuth repository uses authenticated worker RPCs and binds profile and semester", async () => {
  const source = setup((name, body) => {
    if (name === "calendar_begin_oauth") { assert.equal(body.p_profile_id, "profile"); assert.equal(body.p_semester_id, "semester"); return [{ transaction_id: "transaction", connection_id: "connection" }]; }
    if (name === "calendar_consume_oauth") return [{ transaction_id: "transaction", connection_id: "connection", verifier_ciphertext: "encrypted" }];
    assert.equal(body.p_access_token_ciphertext, null); return "connection";
  });
  const repositories = await createCalendarRepositories(config, { fetch: source.fetcher });
  await repositories.connection.beginOAuth({ profileId: "profile", semesterId: "semester", stateHash: "hash", verifierCiphertext: "encrypted", expiresAt: "expiry" });
  assert.deepEqual(await repositories.connection.consumeOAuth({ profileId: "profile", semesterId: "semester", stateHash: "hash" }), { transactionId: "transaction", connectionId: "connection", verifierCiphertext: "encrypted" });
  assert.equal(await repositories.connection.completeOAuth({ transactionId: "transaction", providerSubject: "google", accountEmail: "person@example.test", calendarId: "primary", refreshTokenCiphertext: "encrypted" }), "connection");
});
test("sync repository maps intervals and preserves lease fencing and false acknowledgements", async () => {
  const source = setup((name, body) => {
    if (name === "calendar_lease_sync_jobs") { assert.equal(body.p_limit, 1); return [{ job_id: "job", lease_token: "lease", credential_generation: 3, profile_id: "profile", connection_id: "connection", calendar_id: "primary", refresh_token_ciphertext: "encrypted", access_token_ciphertext: null, access_expires_at: null }]; }
    assert.equal(body.p_lease_token, "lease");
    assert.equal(body.p_credential_generation, 3);
    if (name === "calendar_apply_sync_result") assert.deepEqual(body.p_busy, [{ starts_at: "start", ends_at: "end" }]);
    else assert.equal(body.p_success, false);
    return false;
  });
  const { sync } = await createCalendarRepositories(config, { fetch: source.fetcher });
  assert.equal((await sync.lease())?.jobId, "job");
  assert.equal(await sync.apply({ jobId: "job", leaseToken: "lease", credentialGeneration: 3, coverageStart: "from", coverageEnd: "to", busy: [{ start: "start", end: "end" }], refreshTokenCiphertext: null, accessTokenCiphertext: null, accessExpiresAt: null }), false);
  assert.equal(await sync.fail({ jobId: "job", leaseToken: "lease", credentialGeneration: 3, error: "retryable", refreshTokenCiphertext: null, accessTokenCiphertext: null, accessExpiresAt: null }), false);
});
test("wrong projects are rejected before any network call", async () => {
  await assert.rejects(createCalendarRepositories({ ...config, supabase: { ...config.supabase, url: "https://other.supabase.co" } }, { fetch: async () => { assert.fail("must not connect"); } }), /allowed Almaworks/);
});
test("missing state is distinct from malformed responses and secret-bearing database errors", async () => {
  const empty = await createCalendarRepositories(config, { fetch: setup(() => []).fetcher });
  assert.equal(await empty.connection.consumeOAuth({ profileId: "p", semesterId: "s", stateHash: "h" }), null);
  assert.equal(await empty.sync.lease(), null);
  const invalid = await createCalendarRepositories(config, { fetch: setup(() => ({ secret: "never expose" })).fetcher });
  await assert.rejects(invalid.sync.lease(), error => error instanceof Error && !error.message.includes("never expose"));
});
test("authentication failures and stalled requests produce sanitized bounded failures", async () => {
  await assert.rejects(createCalendarRepositories(config, { fetch: async () => Response.json({ message: "secret-password-provider-detail" }, { status: 401 }) }), error => error instanceof Error && !error.message.includes("secret-password"));
  await assert.rejects(createCalendarRepositories(config, { timeoutMilliseconds: 5, fetch: async () => new Promise<Response>(() => {}) }), /storage is unavailable/);
});
test("hold repository maps booking times and both generations without exposing arbitrary provider IDs", async () => {
  const source = setup((name, body) => {
    if (name === "calendar_lease_hold_jobs") return [{ job_id: "job", lease_token: "lease", request_id: "booking", connection_id: "connection", profile_id: "profile", desired_state: "absent", event_id: "event", generation: 4, credential_generation: 3, calendar_id: "primary", starts_at: "start", ends_at: "end", refresh_token_ciphertext: "encrypted", access_token_ciphertext: null, access_expires_at: null }];
    assert.equal(name, "calendar_finish_hold_job"); assert.equal(body.p_generation, 4); assert.equal(body.p_credential_generation, 3); assert.equal(body.p_success, true);
    return true;
  });
  const { holds } = await createCalendarRepositories(config, { fetch: source.fetcher });
  const job = await holds.lease(); assert.equal(job?.start, "start"); assert.equal(job?.desiredState, "absent");
  assert.equal(await holds.finish({ jobId: "job", leaseToken: "lease", generation: 4, credentialGeneration: 3, success: true, error: null, refreshTokenCiphertext: null, accessTokenCiphertext: null, accessExpiresAt: null }), true);
});
