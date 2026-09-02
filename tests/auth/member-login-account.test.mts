import assert from "node:assert/strict";
import test from "node:test";

test("presents each durable member login account state", async () => {
  const subject = await import("../../src/auth/member-login-account.ts").catch(() => null);
  assert.ok(subject, "the member login account domain module must exist");

  assert.deepEqual(subject.memberLoginPresentation({
    authUserId: "auth-1",
    latestRemovalAuditAction: null,
    profileActive: true,
  }), {
    action: "remove",
    label: "Login enabled",
    state: "enabled",
    tone: "success",
  });
  assert.deepEqual(subject.memberLoginPresentation({
    authUserId: "auth-1",
    latestRemovalAuditAction: null,
    profileActive: false,
  }), {
    action: "remove",
    label: "Account disabled",
    state: "disabled",
    tone: "warning",
  });
  assert.deepEqual(subject.memberLoginPresentation({
    authUserId: "auth-1",
    latestRemovalAuditAction: "member.login_removal_prepared",
    profileActive: false,
  }), {
    action: "retry_removal",
    label: "Removal incomplete",
    state: "removal_incomplete",
    tone: "warning",
  });
  assert.deepEqual(subject.memberLoginPresentation({
    authUserId: null,
    latestRemovalAuditAction: "member.login_removal_prepared",
    profileActive: false,
  }), {
    action: "restore",
    label: "Login removed",
    state: "removed",
    tone: "muted",
  });
  assert.deepEqual(subject.memberLoginPresentation({
    authUserId: null,
    latestRemovalAuditAction: null,
    profileActive: true,
  }), {
    action: "restore",
    label: "No login",
    state: "not_configured",
    tone: "muted",
  });
  assert.equal(subject.memberLoginPresentation({
    authUserId: "auth-1",
    latestRemovalAuditAction: "member.login_restored",
    profileActive: false,
  }).state, "disabled");
});

test("parses a confirmed removal request with a normalized reason", async () => {
  const subject = await import("../../src/auth/member-login-account.ts").catch(() => null);
  assert.ok(subject, "the member login account domain module must exist");

  assert.deepEqual(subject.parseRemoveMemberLoginBody({
    confirmation: "REMOVE",
    reason: "  Duplicate\t test\naccount  ",
  }), {
    confirmation: "REMOVE",
    reason: "Duplicate test account",
  });
});

test("rejects invalid member login removal requests", async () => {
  const subject = await import("../../src/auth/member-login-account.ts").catch(() => null);
  assert.ok(subject, "the member login account domain module must exist");

  assert.throws(
    () => subject.parseRemoveMemberLoginBody({ confirmation: "remove", reason: "Duplicate test account" }),
    /type REMOVE/u,
  );
  assert.throws(
    () => subject.parseRemoveMemberLoginBody({ confirmation: "REMOVE", reason: "  x  " }),
    /at least 3/u,
  );
  assert.throws(
    () => subject.parseRemoveMemberLoginBody({ confirmation: "REMOVE", reason: "a b" }),
    /at least 3/u,
  );
  assert.throws(
    () => subject.parseRemoveMemberLoginBody({ confirmation: "REMOVE", reason: "x".repeat(501) }),
    /500/u,
  );
});

test("parses only the exact restore confirmation token", async () => {
  const subject = await import("../../src/auth/member-login-account.ts").catch(() => null);
  assert.ok(subject, "the member login account domain module must exist");

  assert.deepEqual(subject.parseRestoreMemberLoginBody({ confirmation: "RESTORE" }), {
    confirmation: "RESTORE",
  });
  assert.throws(
    () => subject.parseRestoreMemberLoginBody({ confirmation: "restore" }),
    /type RESTORE/u,
  );
});
