import assert from "node:assert/strict";
import test from "node:test";
import { handleCalendarWorker, drainCalendarWork } from "../../src/calendar/worker-endpoint.ts";
const secret = "s".repeat(40);
const empty = { applied: 0, failed: 0, superseded: 0 };
test("draining includes local disconnect finalization and waits for failures",async()=>{
  let remaining=1;
  const result=await drainCalendarWork({sync:async()=>empty,holds:async()=>empty,disconnect:async()=>remaining-->0?{...empty,applied:1}:empty});
  assert.equal(result.disconnect?.applied,1);
  await assert.rejects(drainCalendarWork({sync:async()=>empty,holds:async()=>empty,disconnect:async()=>{throw new Error("disconnect acknowledgement failed");}}),/worker batch failed/);
});
test("worker rejects missing or incorrect credentials before doing work", async () => {
  for (const header of [null, "Bearer wrong", `Basic ${secret}`]) {
    const request = new Request("https://app.test/api/calendar/worker", { method: "POST", headers: header ? { Authorization: header } : {} });
    const response = await handleCalendarWorker(request, { secret, run: async () => { assert.fail("must not run"); } });
    assert.equal(response.status, 401);
  }
});
test("worker returns aggregate counts and sanitizes runtime failures", async () => {
  const request = new Request("https://app.test/api/calendar/worker", { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
  const response = await handleCalendarWorker(request, { secret, run: async () => ({ sync: empty, holds: { ...empty, applied: 2 } }) });
  assert.equal(response.status, 200); assert.equal((await response.json()).holds.applied, 2);
  const failed = await handleCalendarWorker(request, { secret, run: async () => { throw new Error("secret-token-detail"); } });
  assert.equal(failed.status, 503); assert.ok(!(await failed.text()).includes("secret-token"));
});
test("draining stops empty lanes and bounds nonempty work by deadline", async () => {
  let calls = 0;
  await drainCalendarWork({ sync: async () => { calls++; return empty; }, holds: async () => { calls++; return empty; } });
  assert.equal(calls, 6);
  let time = 0;
  const result = await drainCalendarWork({ now: () => time, budgetMilliseconds: 100, sync: async () => { time += 100; return { ...empty, applied: 1 }; }, holds: async () => ({ ...empty, applied: 1 }) });
  assert.ok(result.sync.applied <= 3); assert.ok(result.holds.applied <= 3);
});
test("failed lane waits for other started lanes to finish before reporting failure", async () => {
  let finished = false;
  await assert.rejects(drainCalendarWork({ sync: async () => { throw new Error("failed"); }, holds: async () => { await new Promise(resolve => setTimeout(resolve, 5)); finished = true; return empty; } }), /Calendar worker batch failed/);
  assert.equal(finished, true);
});
