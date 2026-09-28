import assert from "node:assert/strict";
import test from "node:test";
import { runCalendarHoldBatch, type CalendarHoldJob, type CalendarHoldRepository } from "../../src/calendar/hold-worker.ts";
import { encryptRefreshToken, decryptRefreshToken } from "../../src/calendar/token-crypto.ts";
import { holdEventId, GoogleCalendarError, type GoogleCalendarProvider } from "../../src/calendar/google-provider.ts";
const key = Buffer.alloc(32, 5), now = Date.parse("2026-09-19T12:00:00Z");
const job: CalendarHoldJob = { jobId: "job", leaseToken: "lease", generation: 4, credentialGeneration: 2, profileId: "profile", connectionId: "connection", bookingId: "booking", eventId: holdEventId("booking", "connection"), desiredState: "present", calendarId: "primary", start: "2026-09-20T12:00:00Z", end: "2026-09-20T12:15:00Z", refreshTokenCiphertext: JSON.stringify(encryptRefreshToken("refresh", key, { profileId: "profile", connectionId: "connection" })), accessTokenCiphertext: null, accessExpiresAt: null };
const options = { encryptionKey: key, now: () => now, oauth: { clientId: "client", clientSecret: "secret", callbackUrl: "http://localhost:3000/api/calendar/callback" }, fetch: (async () => Response.json({ access_token: "access", refresh_token: "rotated", token_type: "Bearer", expires_in: 3600 })) as typeof fetch };
function fixture(jobs = [job]) {
  const acknowledgements: Parameters<CalendarHoldRepository["finish"]>[0][] = [];
  const operations: string[] = []; const queue = [...jobs];
  const repository: CalendarHoldRepository = { async lease() { return queue.shift() ?? null; }, async finish(input) { acknowledgements.push(input); return true; } };
  const provider: GoogleCalendarProvider = { async queryBusy() { assert.fail(); }, async upsertHold(input) { operations.push(`create:${input.connectionId}`); return { eventId: holdEventId(input.bookingId,input.connectionId), status: "created" }; }, async deleteHold(input) { operations.push(`delete:${input.connectionId}`); return { eventId: holdEventId(input.bookingId,input.connectionId), status: "deleted" }; } };
  return { repository, provider, acknowledgements, operations };
}
test("each connected party receives its own hold; cancellation uses the same owned identifier", async () => {
  const second = { ...job, connectionId: "startup-connection", profileId: "startup-profile" };
  const state = fixture([job, { ...second, eventId: holdEventId(second.bookingId, second.connectionId), refreshTokenCiphertext: JSON.stringify(encryptRefreshToken("startup-refresh", key, second)) }, { ...job, desiredState: "absent" }]);
  assert.deepEqual(await runCalendarHoldBatch({ ...options, ...state }), { applied: 3, failed: 0, superseded: 0 });
  assert.deepEqual(state.operations, ["create:connection", "create:startup-connection", "delete:connection"]);
  assert.equal(state.acknowledgements[0].generation, 4); assert.equal(state.acknowledgements[0].credentialGeneration, 2);
});
test("provider errors retain rotated encrypted tokens and never acknowledge success", async () => {
  for (const kind of ["ownership", "conflict"] as const) {
  const state = fixture(); state.provider.upsertHold = async () => { throw new GoogleCalendarError(kind); };
  assert.equal((await runCalendarHoldBatch({ ...options, ...state })).failed, 1);
  assert.equal(state.acknowledgements[0].success, false); assert.equal(state.acknowledgements[0].error, kind);
  assert.equal(decryptRefreshToken(JSON.parse(state.acknowledgements[0].refreshTokenCiphertext!),key,job), "rotated");
  }
});
test("wrong event identity fails before touching Google and stale completion is superseded", async () => {
  const wrong = fixture([{ ...job, eventId: "someone-elses-event" }]);
  assert.equal((await runCalendarHoldBatch({ ...options, ...wrong })).failed, 1); assert.equal(wrong.operations.length, 0);
  const stale = fixture(); stale.repository.finish = async () => false;
  assert.deepEqual(await runCalendarHoldBatch({ ...options, ...stale }), { applied: 0, failed: 0, superseded: 1 });
});
test("storage failure is propagated, and a batch limit is enforced", async () => {
  const state = fixture(); state.repository.finish = async () => { throw new Error("database unavailable"); };
  await assert.rejects(runCalendarHoldBatch({ ...options, ...state }), /database unavailable/);
  await assert.rejects(runCalendarHoldBatch({ ...options, ...fixture(), limit: 0 }), /batch limit/);
});
