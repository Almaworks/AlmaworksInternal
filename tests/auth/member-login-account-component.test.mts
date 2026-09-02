import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("components/MemberLoginAccountControl.tsx", "utf8");

test("member login account control exposes every truthful account state and action", () => {
  for (const label of [
    "Login enabled",
    "Account disabled",
    "Removal incomplete",
    "Login removed",
    "No login",
  ]) {
    assert.match(source, new RegExp(`label: [\"']${label}[\"']`, "u"));
  }
  assert.match(source, /Remove login account/u);
  assert.match(source, /Retry removal/u);
  assert.match(source, /Restore login/u);
});

test("removal dialog is accessible and requires a reason plus exact REMOVE confirmation", () => {
  assert.match(source, /role="dialog"/u);
  assert.match(source, /aria-modal="true"/u);
  assert.match(source, /aria-labelledby=/u);
  assert.match(source, /required/u);
  assert.match(source, /confirmation === "REMOVE"/u);
  assert.match(source, /disabled=\{[^}]*!removalReady/u);
  assert.match(source, /event\.key === "Escape"/u);
  assert.match(source, /triggerRef\.current\?\.focus\(\)/u);
});

test("control communicates retained data, recovery states, and refresh failures truthfully", () => {
  assert.match(source, /Contact information, profile details, semester history, and mentorship sessions will remain available to authorized Almaworks administrators\./u);
  assert.match(source, /Login removed\. Contact information and program history were retained\./u);
  assert.match(source, /Program access is blocked, but login deletion needs to be retried/u);
  assert.match(source, /Login updated, but the Members list could not refresh/u);
  assert.match(source, /Retry refresh/u);
  assert.match(source, /mustSendLink/u);
  assert.match(source, /send (?:the )?generated link/u);
  assert.match(source, /Sign-in is restored\. Semester membership remains suspended until you restore it separately\./u);
  assert.doesNotMatch(source, /member (?:was )?deleted|profile (?:was )?deleted|contact (?:data|information) (?:was|were) deleted/iu);
});

test("pending state prevents repeated mutation submission", () => {
  assert.match(source, /if \(pending\) return;/u);
  assert.match(source, /disabled=\{[^}]*pending/u);
});
