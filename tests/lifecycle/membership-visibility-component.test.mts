import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("membership visibility switch exposes accessible All and Active only button choices", async () => {
  const source = await readFile(new URL("../../components/MembershipVisibilitySwitch.tsx", import.meta.url), "utf8");

  assert.match(source, /<button\b/g);
  assert.equal((source.match(/<button\b/g) ?? []).length, 2);
  assert.match(source, /aria-pressed/);
  assert.match(source, /Show all members/);
  assert.match(source, /Show active members only/);
  assert.match(source, />\s*All\s*</);
  assert.match(source, />\s*Active only\s*</);
  assert.match(source, /focus-visible:ring-2/);
});
