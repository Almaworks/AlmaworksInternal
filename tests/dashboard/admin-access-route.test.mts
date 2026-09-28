import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Access owns a dedicated workspace instead of mounting the shared management page", async () => {
  const page = await readFile(
    new URL("../../app/dashboard/admin/access/page.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(page, /export \{ default \} from "\.\.\/page"/u);
  assert.match(page, /AdminAccessWorkspace/u);
});

test("Access data is loaded through a fresh Super Admin API gate", async () => {
  const route = await readFile(
    new URL("../../app/api/admin/access/route.ts", import.meta.url),
    "utf8",
  ).catch(() => "");

  assert.match(route, /createAdminAccessHandlers/u);
  assert.match(route, /authorizeAdminAccessRequest/u);
  const loader = await readFile(
    new URL("../../src/dashboard/admin-access.ts", import.meta.url),
    "utf8",
  );
  assert.match(loader, /requireAuthenticatedUser\(request\)/u);
  assert.match(loader, /createSupabaseAdminCapabilitySource/u);
  assert.match(loader, /const \[superAdmin, profile\] = await Promise\.all/u);
  assert.match(loader, /select\("status,is_active"\)/u);
});

test("dedicated Access workspace retains activation, registration, and cohort membership controls", async () => {
  const workspace = await readFile(
    new URL("../../app/dashboard/admin/access/AdminAccessWorkspace.tsx", import.meta.url),
    "utf8",
  ).catch(() => "");

  assert.match(workspace, /Ready for activation/u);
  assert.match(workspace, /Registration requests/u);
  assert.match(workspace, /Select all filtered/u);
  assert.match(workspace, /\/api\/admin\/lifecycle\/memberships\/activity/u);
  assert.match(workspace, /\/api\/admin\/lifecycle\/memberships\/import/u);
  assert.match(workspace, /\/api\/admin\/users\/approve/u);
  assert.match(workspace, /\/api\/admin\/users\/reject/u);
  assert.match(
    workspace,
    /updateMemberships\(\[member\.membershipId\], "active", `activate:\$\{member\.membershipId\}`, member\.semesterId\)/u,
    "current-cohort activation remains available while the cohort selector is in all-time mode",
  );
  assert.match(
    workspace,
    /const canSetActivity = workspace\.scope === "semester"[\s\S]*?workspace\.semesterId === workspace\.cohorts\.current\.id/u,
    "bulk lifecycle changes remain current-cohort only",
  );
  assert.match(workspace, /targetSemesterId !== workspace\.cohorts\.current\.id/u);
  assert.match(workspace, /Registered \{new Date\(user\.created_at\)\.toLocaleDateString\(\)\}/u);
  assert.match(workspace, /Requested: \{user\.requested_role === "mentor" \? "Mentor" : "Startup"\}/u);
  assert.match(workspace, /\(not assigned\)/u);
});

test("dedicated Access workspace does not present stale queues as an empty success", async () => {
  const workspace = await readFile(
    new URL("../../app/dashboard/admin/access/AdminAccessWorkspace.tsx", import.meta.url),
    "utf8",
  ).catch(() => "");

  assert.match(workspace, /if \(loading\) return <DataLoading/u);
  assert.match(workspace, /if \(loadError \|\| !workspace\)/u);
  assert.match(workspace, /role="alert"/u);
  assert.match(workspace, /Try again/u);
  assert.match(workspace, /loadAbort\.current\?\.abort\(\)/u);
  assert.match(workspace, /signal: controller\.signal/u);
  assert.match(workspace, /mounted\.current/u);
  assert.match(workspace, /lastQuery\.current = query/u);
  assert.match(workspace, /return await load\(lastQuery\.current\)/u);
  assert.match(workspace, /async function changeScope[\s\S]*?setMessage\(null\)[\s\S]*?setMutationError\(null\)/u);
  assert.match(workspace, /loadError[\s\S]*?message/u, "persisted-success context remains visible after a refresh failure");
});
