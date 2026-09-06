import assert from "node:assert/strict";
import test from "node:test";

import { StartupDeletionError, parseStartupDeletionRequest } from "../../src/program/server/startup-deletion.ts";

test("permanent startup deletion requires the exact startup name as confirmation", () => {
  assert.deepEqual(
    parseStartupDeletionRequest({ confirmationName: "Test Startup", startupOrganizationId: "organization-id" }),
    { confirmationName: "Test Startup", startupOrganizationId: "organization-id" },
  );
  assert.throws(
    () => parseStartupDeletionRequest({ confirmationName: "", startupOrganizationId: "organization-id" }),
    StartupDeletionError,
  );
});
