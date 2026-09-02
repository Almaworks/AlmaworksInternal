import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  acceptMemberLoginPreflight,
  beginMemberLoginMutation,
  beginMemberLoginPreflight,
  completeMemberLoginRemoval,
  completeMemberLoginRestoration,
  containFocusIndex,
  createMemberLoginInteraction,
  failMemberLoginMutation,
  LatestMemberLoginPreflight,
  markMemberLoginPartialRemoval,
  memberLoginRequestHeaders,
  recordMemberLoginRefresh,
  synchronizeMemberLoginPresentation,
} from "../../components/member-login-account-model.ts";

const source = readFileSync("components/MemberLoginAccountControl.tsx", "utf8");
const modelSource = readFileSync("components/member-login-account-model.ts", "utf8");
const implementation = `${source}\n${modelSource}`;

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
  assert.match(source, /<dialog/u);
  assert.match(source, /showModal\(\)/u);
  assert.match(source, /role="dialog"/u);
  assert.match(source, /aria-modal="true"/u);
  assert.match(source, /aria-labelledby=/u);
  assert.match(source, /required/u);
  assert.match(source, /confirmation === "REMOVE"/u);
  assert.match(source, /disabled=\{[^}]*!removalReady/u);
  assert.match(source, /event\.key === "Escape"/u);
  assert.match(source, /triggerRef\.current\?\.focus\(\)/u);
  assert.match(source, /useId\(\)/u);
  assert.match(source, /containFocusIndex/u);
});

test("control communicates retained data, recovery states, and refresh failures truthfully", () => {
  assert.match(source, /Contact information, profile details, semester history, and mentorship sessions will remain available to authorized Almaworks administrators\./u);
  assert.match(implementation, /Login removed\. Contact information and program history were retained\./u);
  assert.match(implementation, /Program access is blocked, but login deletion needs to be retried/u);
  assert.match(implementation, /Login updated, but the Members list could not refresh/u);
  assert.match(source, /Retry refresh/u);
  assert.match(source, /mustSendLink/u);
  assert.match(source, /send (?:the )?generated link/u);
  assert.match(implementation, /Sign-in is restored\. Semester membership remains suspended until you restore it separately\./u);
  assert.doesNotMatch(implementation, /member (?:was )?deleted|profile (?:was )?deleted|contact (?:data|information) (?:was|were) deleted/iu);
});

test("pending state prevents repeated mutation submission", () => {
  assert.match(source, /if \(pending\) return;/u);
  assert.match(source, /disabled=\{[^}]*pending/u);
  assert.match(source, /mutationInFlightRef\.current/u);
});

test("component consumes the controlled batched presentation and invalidates stale preflight", () => {
  assert.match(source, /accountPresentation\?: MemberLoginPresentation/u);
  assert.match(source, /setPreview\(null\)/u);
  assert.match(source, /signal: request\.signal/u);
  assert.match(source, /isCurrent\(request\.id\)/u);
});

test("latest preflight aborts and rejects stale responses", () => {
  const guard = new LatestMemberLoginPreflight();
  const first = guard.begin();
  const second = guard.begin();

  assert.equal(first.signal.aborted, true);
  assert.equal(guard.isCurrent(first.id), false);
  assert.equal(guard.isCurrent(second.id), true);

  guard.invalidate();
  assert.equal(second.signal.aborted, true);
  assert.equal(guard.isCurrent(second.id), false);
});

test("502 removal keeps its mode and appends refresh failure after the database mutation", () => {
  let state = createMemberLoginInteraction("remove");
  state = beginMemberLoginPreflight(state);
  state = acceptMemberLoginPreflight(state);
  state = beginMemberLoginMutation(state, true);
  state = markMemberLoginPartialRemoval(state);
  state = recordMemberLoginRefresh(state, false);

  assert.equal(state.mode, "remove");
  assert.equal(state.pending, false);
  assert.equal(state.primaryMessage, "Program access is blocked, but login deletion needs to be retried");
  assert.equal(state.refreshMessage, "Login updated, but the Members list could not refresh");
  assert.equal(state.refreshRequired, true);
});

test("completed operation stays stable while its dialog remains open", () => {
  let removal = acceptMemberLoginPreflight(beginMemberLoginPreflight(createMemberLoginInteraction("remove")));
  removal = completeMemberLoginRemoval(beginMemberLoginMutation(removal, true));
  removal = synchronizeMemberLoginPresentation(removal, "restore", "removed", true);
  assert.equal(removal.mode, "remove");
  assert.equal(removal.completed, "remove");
  assert.equal(removal.primaryMessage, "Login removed. Contact information and program history were retained.");

  let restoration = acceptMemberLoginPreflight(beginMemberLoginPreflight(createMemberLoginInteraction("restore")));
  restoration = completeMemberLoginRestoration(beginMemberLoginMutation(restoration, true), {
    actionLink: "https://example.test/invite",
    mustSendLink: true,
  });
  restoration = recordMemberLoginRefresh(restoration, false);
  assert.equal(restoration.mode, "restore");
  assert.equal(restoration.completed, "restore");
  assert.equal(restoration.actionLink, "https://example.test/invite");
  assert.match(restoration.primaryMessage ?? "", /Semester membership remains suspended/u);
  assert.equal(restoration.refreshMessage, "Login updated, but the Members list could not refresh");

  const staleAfterClose = synchronizeMemberLoginPresentation(restoration, "remove", "removed", false);
  assert.equal(staleAfterClose.mode, "restore");
  assert.equal(staleAfterClose.completed, "restore");

  const refreshedAfterClose = synchronizeMemberLoginPresentation(restoration, "remove", "enabled", false);
  assert.equal(refreshedAfterClose.mode, "remove");
  assert.equal(refreshedAfterClose.completed, null);
});

test("mutation gating prevents stale-preflight and double submission", () => {
  const closed = createMemberLoginInteraction("remove");
  assert.equal(beginMemberLoginMutation(closed, true), closed);

  const ready = acceptMemberLoginPreflight(beginMemberLoginPreflight(closed));
  assert.equal(beginMemberLoginMutation(ready, false), ready);
  const pending = beginMemberLoginMutation(ready, true);
  assert.equal(pending.pending, true);
  assert.equal(beginMemberLoginMutation(pending, true), pending);
  assert.equal(failMemberLoginMutation(pending).pending, false);

  const synchronized = synchronizeMemberLoginPresentation(ready, "restore", "not_configured", true);
  assert.equal(synchronized.mode, "restore");
});

test("request headers authenticate mutations and focus containment wraps in both directions", () => {
  assert.deepEqual(memberLoginRequestHeaders("token-123"), {
    Authorization: "Bearer token-123",
    "Content-Type": "application/json",
  });
  assert.equal(containFocusIndex(0, -1, 3), 2);
  assert.equal(containFocusIndex(2, 1, 3), 0);
  assert.equal(containFocusIndex(1, 1, 3), 2);
  assert.equal(containFocusIndex(0, 1, 0), -1);
});
