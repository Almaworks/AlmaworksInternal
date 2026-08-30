import assert from "node:assert/strict";
import test from "node:test";

import {
  createBulkSetMembershipActivityCommand,
  createImportPriorMembershipsCommand,
} from "../../src/lifecycle/cohort-commands.ts";

test("bulk lifecycle command authorizes the target semester and persists only selected memberships", async () => {
  const observed: unknown[] = [];
  const command = createBulkSetMembershipActivityCommand(async (_request, semesterId) => {
    observed.push({ authorizedSemesterId: semesterId });
    return {
      bulkSetMembershipActivity: async (args) => {
        observed.push(args);
        return { data: 2, error: null };
      },
    };
  });

  const result = await command({
    request: new Request("https://example.test"),
    semesterId: "spring-2026",
    membershipIds: ["membership-1", "membership-2"],
    activity: "inactive",
  });

  assert.deepEqual(result, { updated: 2, status: "suspended" });
  assert.deepEqual(observed, [
    { authorizedSemesterId: "spring-2026" },
    { p_semester_id: "spring-2026", p_membership_ids: ["membership-1", "membership-2"], p_is_active: false },
  ]);
});

test("bulk lifecycle command rejects partial persistence", async () => {
  const command = createBulkSetMembershipActivityCommand(async () => ({
    bulkSetMembershipActivity: async () => ({ data: 1, error: null }),
  }));
  await assert.rejects(
    command({
      request: new Request("https://example.test"),
      semesterId: "spring-2026",
      membershipIds: ["membership-1", "membership-2"],
      activity: "active",
    }),
    /changed 1 of 2/i,
  );
});

test("prior-cohort import requires authorization for both cohorts and returns deduplicated counts", async () => {
  const authorized: string[] = [];
  const command = createImportPriorMembershipsCommand(async (_request, semesterId) => {
    authorized.push(semesterId);
    return {
      importPriorMemberships: async (args) => ({
        data: [{ imported_count: 3, skipped_count: 1, source_count: 4, received: args }],
        error: null,
      }),
    };
  });

  const result = await command({
    request: new Request("https://example.test"),
    sourceSemesterId: "fall-2025",
    targetSemesterId: "spring-2026",
    membershipIds: ["membership-1", "membership-2"],
  });

  assert.deepEqual(authorized, ["fall-2025", "spring-2026"]);
  assert.deepEqual(result, { imported: 3, skipped: 1, source: 4 });
});
