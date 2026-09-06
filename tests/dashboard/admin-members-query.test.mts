import assert from "node:assert/strict";
import test from "node:test";

test("member directory query embeds platform roles through the member profile relationship", async () => {
  const subject = await import("../../src/dashboard/admin-members-query.ts");

  assert.match(
    subject.memberDirectorySelect,
    /platform_roles!platform_roles_profile_id_fkey\(role\)/u,
  );
});
