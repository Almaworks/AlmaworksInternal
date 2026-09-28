import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(import.meta.dirname, "../../app/dashboard/admin/page.tsx"), "utf8");

test("admin overview is a distinct operational signal board", () => {
  assert.match(source, /tab === 'overview'/u);
  assert.match(source, /Operational signals/u);
  assert.doesNotMatch(source, /Launch sequence/u);
  assert.doesNotMatch(source, /\/\* .*Tabs .*\*\//u);
});

test("management modules have dedicated route entry points", () => {
  const access = readFileSync(
    resolve(import.meta.dirname, "../../app/dashboard/admin/access/page.tsx"),
    "utf8",
  );
  assert.match(access, /AdminAccessWorkspace/u);
  assert.doesNotMatch(access, /export \{ default \} from "\.\.\/page"/u);

  for (const segment of ["members", "startups"]) {
    const route = resolve(import.meta.dirname, `../../app/dashboard/admin/${segment}/page.tsx`);
    assert.match(readFileSync(route, "utf8"), /export \{ default \} from "\.\.\/page"/u);
  }
});
