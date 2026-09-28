import assert from "node:assert/strict";
import test from "node:test";
import { adminModuleLoads } from "../../src/dashboard/admin-module-loads.ts";

test("each admin module declares only its own data requirements", () => {
  assert.deepEqual(adminModuleLoads.overview, ["capabilities", "semester"]);
  assert.deepEqual(adminModuleLoads.members, ["capabilities", "members", "member-audit", "semester"]);
  assert.deepEqual(adminModuleLoads.startups, ["capabilities", "members", "semester", "startups"]);
  assert.deepEqual(adminModuleLoads.access, ["capabilities", "members", "pending-users", "semester"]);
  assert.deepEqual(adminModuleLoads['friday-program'], ['semester']);
});
