import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync("app/dashboard/participant/ParticipantDashboard.tsx", "utf8");
const upload = readFileSync("components/profile-photo/ProfilePhotoControl.tsx", "utf8");
const avatar = readFileSync("components/profile-photo/ProfileAvatar.tsx", "utf8");
const avatarStyles = readFileSync("components/profile-photo/profile-photo.module.css", "utf8");

test("participant dashboard uses the shared fallback avatar in personal and discovery views", () => {
  assert.match(dashboard, /ProfileAvatar name=\{view\.identity\.fullName\}/u);
  assert.match(dashboard, /ProfileAvatar name=\{entry\.name\} photoUrl=\{entry\.photoUrl\}/u);
  assert.match(dashboard, /ProfilePhotoControl[\s\S]*onPhotoChange=\{updateOwnPhoto\}/u);
});

test("photo control accepts only supported images and updates through the authenticated endpoint", () => {
  assert.match(upload, /image\/jpeg.*image\/png.*image\/webp/u);
  assert.match(upload, /4 \* 1024 \* 1024/u);
  assert.match(upload, /file\.size === 0/u);
  assert.match(upload, /authenticatedFetch\("\/api\/profile-photo", \{ method: "POST", body \}\)/u);
  assert.match(upload, /authenticatedFetch\("\/api\/profile-photo", \{ method: "DELETE" \}\)/u);
  assert.match(upload, /Photo changes are disabled in this fictional preview/u);
  assert.match(upload, /role=\{feedback\.error \? "alert" : "status"\}/u);
});

test("avatar replaces a broken image with initials", () => {
  assert.match(avatar, /onError=\{\(\) => setFailedUrl\(imageUrl\)\}/u);
  assert.match(avatar, /function initials/u);
  assert.match(avatarStyles, /object-fit: cover/u);
});

test("discovery card text styles do not override the shared avatar centering", () => {
  const dashboardStyles = readFileSync("app/design-preview/participant-dashboard/participant-dashboard.module.css", "utf8");

  assert.match(dashboardStyles, /\.miniGrid > button > div > span \{/u);
  assert.doesNotMatch(dashboardStyles, /\.miniGrid span \{/u);
  assert.match(avatarStyles, /\.avatar \{ display: inline-grid; place-items: center;/u);
});
