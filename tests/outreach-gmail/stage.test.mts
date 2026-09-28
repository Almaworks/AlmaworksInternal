import test from "node:test";
import assert from "node:assert/strict";
import { advanceStageAfterSend, type StageStore } from "../../src/outreach-gmail/stage.ts";

function fixture(stage = "not_contacted") {
  let current = stage;
  let writes = 0;
  const store: StageStore = {
    read: async () => ({ stage: current, updatedAt: "v1", archived: false }),
    advance: async expected => { assert.equal(expected, "v1"); writes++; current = "contacted"; return true; },
  };
  return { store, writes: () => writes };
}
test("accepted email advances only not_contacted and replay does not duplicate the change", async () => {
  const f = fixture();
  assert.equal(await advanceStageAfterSend("sent", f.store), "updated");
  assert.equal(await advanceStageAfterSend("sent", f.store), "unchanged");
  assert.equal(f.writes(), 1);
});
test("all other stages and unconfirmed send outcomes remain unchanged", async () => {
  for (const stage of ["researching", "contacted", "replied", "conversation_scheduled", "ready", "declined", "closed"]) {
    const f = fixture(stage); assert.equal(await advanceStageAfterSend("sent", f.store), "unchanged"); assert.equal(f.writes(), 0);
  }
  for (const status of ["sending", "unknown", "rejected", "reviewed"]) {
    const f = fixture(); assert.equal(await advanceStageAfterSend(status, f.store), "unchanged"); assert.equal(f.writes(), 0);
  }
});
test("concurrent stage changes are preserved; storage failures return a warning outcome", async () => {
  const f = fixture();
  f.store.advance = async () => false;
  assert.equal(await advanceStageAfterSend("sent", f.store), "pending");
  f.store.read = async () => { throw new Error("unavailable"); };
  assert.equal(await advanceStageAfterSend("sent", f.store), "pending");
  f.store.read = async () => ({ stage: "not_contacted", updatedAt: "v2", archived: true });
  assert.equal(await advanceStageAfterSend("sent", f.store), "unchanged");
});
