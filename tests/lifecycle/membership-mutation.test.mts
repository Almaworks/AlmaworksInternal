import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { persistAndRefreshMembership } from "../../src/lifecycle/membership-mutation.ts";

test("mutation failure is reported without running refreshes", async () => {
  let refreshCalls = 0;
  const outcome = await persistAndRefreshMembership({
    persist: async () => { throw new Error("mutation rejected"); },
    refreshes: [async () => { refreshCalls += 1; }],
  });

  assert.deepEqual(outcome, { status: "mutation_failed", message: "mutation rejected" });
  assert.equal(refreshCalls, 0);
});

test("successful persistence remains successful when a thrown refresh fails", async () => {
  let successfulRefreshCalls = 0;
  const outcome = await persistAndRefreshMembership({
    persist: async () => undefined,
    refreshes: [
      async () => { throw new Error("local refresh failed"); },
      async () => { successfulRefreshCalls += 1; },
    ],
  });

  assert.deepEqual(outcome, { status: "updated_refresh_failed" });
  assert.equal(successfulRefreshCalls, 1);
});

test("successful persistence detects a cohort reload that exposes false", async () => {
  const outcome = await persistAndRefreshMembership({
    persist: async () => undefined,
    refreshes: [async () => true, async () => false],
  });

  assert.deepEqual(outcome, { status: "updated_refresh_failed" });
});

test("successful persistence reports updated only after every refresh succeeds", async () => {
  const outcome = await persistAndRefreshMembership({
    persist: async () => undefined,
    refreshes: [async () => undefined, async () => true],
  });

  assert.deepEqual(outcome, { status: "updated" });
});

test("admin UI distinguishes committed refresh failure and exposes retry", async () => {
  const page = await readFile(new URL("../../app/dashboard/admin/page.tsx", import.meta.url), "utf8");
  assert.match(page, /persistAndRefreshMembership\(/u);
  assert.match(page, /Membership updated; refresh failed\./u);
  assert.match(page, /membershipRefreshRetrying \? 'Refreshing\.\.\.' : 'Retry refresh'/u);
});
