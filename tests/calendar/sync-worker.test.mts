import assert from "node:assert/strict";
import test from "node:test";
import { runCalendarSyncBatch, type CalendarSyncJob, type CalendarSyncRepository } from "../../src/calendar/sync-worker.ts";
import { encryptRefreshToken, decryptRefreshToken } from "../../src/calendar/token-crypto.ts";
import { GoogleCalendarError } from "../../src/calendar/google-provider.ts";

const key = Buffer.alloc(32, 7);
const now = Date.parse("2026-09-19T12:00:00Z");
const context = { profileId: "owner", connectionId: "connection" };
const job: CalendarSyncJob = { ...context, jobId: "job", leaseToken: "lease", credentialGeneration: 3, calendarId: "primary", refreshTokenCiphertext: JSON.stringify(encryptRefreshToken("refresh-secret", key, context)), accessTokenCiphertext: null, accessExpiresAt: null };
function setup() {
  const applied: Parameters<CalendarSyncRepository["apply"]>[0][] = [];
  const failed: Parameters<CalendarSyncRepository["fail"]>[0][] = [];
  let leased = false;
  const repository: CalendarSyncRepository = {
    async lease() { if (leased) return null; leased = true; return job; },
    async apply(input) { applied.push(input); return true; },
    async fail(input) { failed.push(input); return true; },
  };
  return { repository, applied, failed };
}
const options = { encryptionKey: key, oauth: { clientId: "client", clientSecret: "secret", callbackUrl: "http://localhost:3000/api/calendar/callback" }, now: () => now };
const tokenFetch: typeof fetch = async () => Response.json({ access_token: "access-secret", refresh_token: "rotated-secret", token_type: "Bearer", expires_in: 3600 });
test("sync fetches bounded busy coverage and commits encrypted credentials under the same lease", async () => {
  const state = setup();
  const result = await runCalendarSyncBatch({ ...options, repository: state.repository, fetch: tokenFetch, queryBusy: async input => {
    assert.equal(input.accessToken, "access-secret");
    assert.equal(input.from, "2026-09-18T00:00:00.000Z");
    assert.equal(Date.parse(input.to) - Date.parse(input.from), 89 * 86400000);
    return [{ start: "2026-09-20T12:00:00Z", end: "2026-09-20T13:00:00Z" }];
  } });
  assert.deepEqual(result, { applied: 1, failed: 0, superseded: 0 });
  assert.equal(state.applied[0].leaseToken, "lease");
  assert.equal(state.applied[0].busy.length, 1);
  assert.equal(decryptRefreshToken(JSON.parse(state.applied[0].refreshTokenCiphertext!), key, context), "rotated-secret");
  assert.ok(!JSON.stringify(state.applied).includes("access-secret"));
});
test("provider failure never publishes empty availability and persists only a safe error category", async () => {
  const state = setup();
  const result = await runCalendarSyncBatch({ ...options, repository: state.repository, fetch: tokenFetch, queryBusy: async () => { throw new GoogleCalendarError("reconnect"); } });
  assert.equal(result.failed, 1);
  assert.equal(state.applied.length, 0);
  assert.equal(state.failed[0].error, "reconnect");
  assert.equal(state.failed[0].credentialGeneration, 3);
  assert.equal(decryptRefreshToken(JSON.parse(state.failed[0].refreshTokenCiphertext!), key, context), "rotated-secret");
});
test("expired lease acknowledgement is superseded, never reported as published", async () => {
  const state = setup(); state.repository.apply = async () => false;
  const result = await runCalendarSyncBatch({ ...options, repository: state.repository, fetch: tokenFetch, queryBusy: async () => [] });
  assert.deepEqual(result, { applied: 0, failed: 0, superseded: 1 });
});
test("foreign encrypted credentials fail closed before Google access", async () => {
  const state = setup(); let leased = false;
  state.repository.lease = async () => { if (leased) return null; leased = true; return { ...job, profileId: "other" }; };
  const result = await runCalendarSyncBatch({ ...options, repository: state.repository, fetch: async () => { throw new Error("must not fetch"); }, queryBusy: async () => { throw new Error("must not query"); } });
  assert.equal(result.failed, 1); assert.equal(state.failed[0].error, "credentials");
});
test("batch limit is bounded and failed persistence aborts instead of silently losing work", async () => {
  const state = setup(); state.repository.fail = async () => { throw new Error("database unavailable"); };
  await assert.rejects(runCalendarSyncBatch({ ...options, repository: state.repository, limit: 51 }), /batch limit/);
  await assert.rejects(runCalendarSyncBatch({ ...options, repository: state.repository, fetch: tokenFetch, queryBusy: async () => { throw new Error("sensitive provider body"); } }), /database unavailable/);
});
test("valid cached access token avoids refresh and preserves stored credentials", async () => {
  const state = setup(); let leased = false;
  state.repository.lease = async () => {
    if (leased) return null; leased = true;
    return { ...job, accessTokenCiphertext: JSON.stringify(encryptRefreshToken("cached", key, context)), accessExpiresAt: new Date(now + 3600000).toISOString() };
  };
  await runCalendarSyncBatch({ ...options, repository: state.repository, fetch: async () => { assert.fail("Unnecessary token refresh"); }, queryBusy: async input => { assert.equal(input.accessToken, "cached"); return []; } });
  assert.equal(state.applied[0].accessTokenCiphertext, null);
  assert.equal(state.applied[0].refreshTokenCiphertext, null);
});
test("database publication failure propagates without marking a provider failure", async () => {
  const state = setup(); state.repository.apply = async () => { throw new Error("publication failed"); };
  await assert.rejects(runCalendarSyncBatch({ ...options, repository: state.repository, fetch: tokenFetch, queryBusy: async () => [] }), /publication failed/);
  assert.equal(state.failed.length, 0);
});

test("sync retains earlier-today busy time across UTC rollover without shortening the 85-day import horizon", async () => {
  const state = setup();
  const observed = Date.parse("2026-09-20T01:15:00Z");
  const earlierToday = {start:"2026-09-19T15:00:00Z",end:"2026-09-19T22:00:00Z"};
  const result = await runCalendarSyncBatch({...options,now:()=>observed,repository:state.repository,fetch:tokenFetch,queryBusy:async input=>{
    assert.ok(Date.parse(input.from)<=Date.parse(earlierToday.start));
    assert.ok(Date.parse(input.to)>=observed+85*86400000);
    assert.ok(Date.parse(input.to)-Date.parse(input.from)<=90*86400000);
    return [earlierToday];
  }});
  assert.equal(result.applied,1);
  assert.deepEqual(state.applied[0].busy,[earlierToday]);
});
