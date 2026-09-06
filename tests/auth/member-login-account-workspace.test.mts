import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../../app/dashboard/admin/page.tsx", import.meta.url), "utf8");
const memberQuery = readFileSync(new URL("../../src/dashboard/admin-members-query.ts", import.meta.url), "utf8");

test("members workspace loads durable login fields and latest account audit in one batch", () => {
  assert.match(memberQuery, /auth_user_id,[\s\S]*?is_active,[\s\S]*?created_at,[\s\S]*?memberships:semester_memberships/u);
  assert.match(page, /memberDirectorySelect/u);
  assert.match(page, /profile_is_active: boolean/u);
  assert.match(page, /membership_is_active: boolean/u);
  assert.match(page, /latest_removal_audit_action/u);
  assert.match(page, /from\('program_audit_events'\)[\s\S]*?\.in\('subject_id', memberProfileIds\)[\s\S]*?\.in\('action', MEMBER_LOGIN_AUDIT_ACTIONS\)[\s\S]*?\.order\('created_at', \{ ascending: false \}\)/u);
  assert.equal((page.match(/from\('program_audit_events'\)/gu) ?? []).length, 1);
});

test("members workspace resolves removal capability from the authenticated endpoint and fails closed", () => {
  assert.match(page, /useState\(false\)/u);
  assert.match(page, /fetch\('\/api\/auth\/capabilities'/u);
  assert.match(page, /Authorization: `Bearer \$\{accessToken\}`/u);
  assert.match(page, /payload\.data\?\.canRemoveMemberLogin === true/u);
  assert.match(page, /catch \{[\s\S]*?return false/u);
  assert.doesNotMatch(page, /canRemoveMemberLogin[^\n]*role/u);
});

test("members workspace renders separate lifecycle and account columns using durable profile identity", () => {
  assert.match(page, />\s*Status\s*<SortIcon field="membership_is_active" \/>/u);
  assert.match(page, />\s*Account\s*</u);
  assert.match(page, /<MemberLoginAccountControl/u);
  assert.match(page, /profileId=\{m\.id\}/u);
  assert.match(page, /authUserId=\{m\.auth_user_id\}/u);
  assert.match(page, /profileActive=\{m\.profile_is_active\}/u);
  assert.match(page, /canRemoveMemberLogin=\{canRemoveMemberLogin\}/u);
  assert.match(page, /accountPresentation=\{m\.accountPresentation\}/u);
  assert.match(page, /memberLoginPresentation\(\{[\s\S]*?authUserId: member\.auth_user_id,[\s\S]*?profileActive: member\.profile_is_active/u);
  assert.match(page, /<td colSpan=\{7\}/u);
});

test("account mutations refresh every membership projection without resetting workspace controls", () => {
  assert.match(page, /async function refreshMemberLoginReadModels\(\)/u);
  assert.match(page, /refreshMembershipReadModels\(membershipRefreshes\(\)\)/u);
  assert.match(page, /const membershipRefreshes = \(\) => \[loadAll, cohort\.reload, cohort\.reloadCurrent\] as const/u);
  assert.match(page, /onChanged=\{refreshMemberLoginReadModels\}/u);
  assert.doesNotMatch(page, /refreshMemberLoginReadModels[\s\S]{0,500}setMemberSearch/u);
  assert.doesNotMatch(page, /refreshMemberLoginReadModels[\s\S]{0,500}setMemberVisibility/u);
});
