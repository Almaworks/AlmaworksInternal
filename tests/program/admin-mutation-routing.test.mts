import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adminPage = await readFile(new URL("../../app/dashboard/admin/page.tsx", import.meta.url), "utf8");
const appendRoute = await readFile(new URL("../../app/api/admin/lifecycle/semesters/meetings/append/route.ts", import.meta.url), "utf8").catch(() => "");
const rejectRoute = await readFile(new URL("../../app/api/admin/users/reject/route.ts", import.meta.url), "utf8").catch(() => "");

test("retired admin schedule does not write meetings; append endpoint retains semester authorization", () => {
  assert.doesNotMatch(adminPage, /from\(['"]meetings['"]\)\.upsert/u);
  assert.doesNotMatch(adminPage, /\/api\/admin\/lifecycle\/semesters\/meetings\/append/u);
  assert.match(appendRoute, /requireSemesterAdmin\(request, body\.semesterId\)/u);
  assert.match(appendRoute, /adminClient[\s\S]+from\("meetings"\)[\s\S]+upsert/u);
  assert.match(appendRoute, /ignoreDuplicates:\s*true/u);
});

test("profile rejection is server-authorized and browser member activity is semester-scoped", () => {
  assert.doesNotMatch(adminPage, /from\(['"]profiles['"]\)\.update\(\{\s*(?:status|is_active)/u);
  assert.match(adminPage, /adminFetch\(['"]\/api\/admin\/users\/reject['"]/u);
  assert.match(adminPage, /adminFetch\(['"]\/api\/admin\/lifecycle\/memberships\/activity['"]/u);
  assert.match(rejectRoute, /requireAuthenticatedUserWithRls\(request\)/u);
  assert.match(rejectRoute, /isSuperAdmin\(profileId\)/u);
  assert.match(rejectRoute, /userClient[\s\S]+from\(['"]profiles['"]\)[\s\S]+update\(\{\s*status:\s*['"]rejected['"]/u);
  assert.match(rejectRoute, /Active Super Admin access required\./u);
});
