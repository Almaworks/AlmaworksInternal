import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("components/profile-photo/AdminProfilePhotoWorkspace.tsx", "utf8");
const preview = readFileSync("app/design-preview/member-profile/page.tsx", "utf8");

test("admin profile workspace validates complete own-profile payloads before rendering controls", () => {
  assert.match(workspace, /export function isAdminProfilePhotoResponse/u);
  assert.match(workspace, /typeof value\.fullName === "string"/u);
  assert.match(workspace, /typeof value\.email === "string"/u);
  assert.match(workspace, /typeof value\.eligible === "boolean"/u);
  assert.match(workspace, /value\.eligible \|\| typeof value\.reason === "string"/u);
  assert.match(workspace, /!response\.ok \|\| !isAdminProfilePhotoResponse\(payload\)/u);
});

test("admin profile preview is development-only and cannot call the real upload endpoint", () => {
  assert.match(preview, /process\.env\.NODE_ENV !== "development"\) notFound\(\)/u);
  assert.match(preview, /previewData=/u);
  assert.match(workspace, /if \(previewData\) \{[\s\S]*?return;/u);
  assert.match(workspace, /<ProfilePhotoControl[\s\S]*?preview=\{previewData !== undefined\}/u);
  assert.match(workspace, /authenticatedFetch\("\/api\/profile-photo"\)/u);
});

test("ineligible accounts receive their server reason instead of an upload control", () => {
  assert.match(workspace, /profile\.eligible \? <ProfilePhotoControl/u);
  assert.match(workspace, /\{profile\.reason\}/u);
  assert.match(workspace, /Photo changes are unavailable/u);
});
