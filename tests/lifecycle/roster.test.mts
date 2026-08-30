import assert from "node:assert/strict";
import test from "node:test";

import { previewRoster } from "../../src/lifecycle/roster.ts";

test("roster preview normalizes valid rows and matches returning identities", () => {
  const preview = previewRoster(
    [
      {
        email: "  Founder@Example.com ",
        fullName: "  Ada Founder ",
        role: "startup",
        startupName: " Orbital Labs ",
      },
      {
        email: "mentor@example.com",
        fullName: "Grace Mentor",
        role: "mentor",
      },
    ],
    new Map([["mentor@example.com", { profileId: "profile-1", displayName: "Grace M." }]]),
  );

  assert.equal(preview.summary.ready, 2);
  assert.equal(preview.summary.invalid, 0);
  assert.equal(preview.rows[0]?.email, "founder@example.com");
  assert.equal(preview.rows[0]?.startupName, "Orbital Labs");
  assert.equal(preview.rows[1]?.match?.kind, "returning-profile");
});

test("roster preview catches duplicate emails and missing startup assignments", () => {
  const preview = previewRoster([
    { email: "same@example.com", fullName: "First", role: "mentor" },
    { email: " SAME@example.com ", fullName: "Second", role: "startup" },
    { email: "founder@example.com", fullName: "Founder", role: "startup" },
  ]);

  assert.equal(preview.summary.ready, 0);
  assert.equal(preview.summary.invalid, 3);
  assert.deepEqual(
    preview.rows[0]?.issues.map((issue) => issue.code),
    ["duplicate_email"],
  );
  assert.deepEqual(
    preview.rows[1]?.issues.map((issue) => issue.code).sort(),
    ["duplicate_email", "startup_required"],
  );
  assert.deepEqual(
    preview.rows[2]?.issues.map((issue) => issue.code),
    ["startup_required"],
  );
});

test("roster preview rejects unsupported roles and malformed contact data", () => {
  const preview = previewRoster([
    { email: "not-an-email", fullName: "", role: "owner" },
  ]);

  assert.deepEqual(
    preview.rows[0]?.issues.map((issue) => issue.code).sort(),
    ["email_invalid", "name_required", "role_invalid"],
  );
});
