import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("canonical access starts independent role and membership reads together", async () => {
  const source = await readFile("src/program/canonical-access.ts", "utf8");

  assert.match(
    source,
    /const \[platformResult, membershipResult\] = await Promise\.all\(\[\s*client\s*\.from\("platform_roles"\)[\s\S]*?client\s*\.from\("semester_memberships"\)/u,
  );
});
