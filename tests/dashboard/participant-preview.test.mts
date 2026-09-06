import assert from "node:assert/strict";
import test from "node:test";

test("admin VIEW AS choices open dedicated previews and return to admin", async () => {
  const subject = await import("../../src/dashboard/participant-preview.ts").catch(() => null);
  assert.ok(subject, "the participant preview module must exist");

  assert.equal(subject.adminViewDestination("admin"), "/dashboard/admin");
  assert.equal(subject.adminViewDestination("startup"), "/dashboard/admin/preview/startup");
  assert.equal(subject.adminViewDestination("mentor"), "/dashboard/admin/preview/mentor");
  assert.equal(subject.parseParticipantPreviewRole("startup"), "startup");
  assert.equal(subject.parseParticipantPreviewRole("mentor"), "mentor");
  assert.equal(subject.parseParticipantPreviewRole("admin"), null);
});

test("VIEW AS hides the current screen until every role transition completes", async () => {
  const subject = await import("../../src/dashboard/participant-preview.ts").catch(() => null);
  assert.ok(subject, "the participant preview module must exist");
  assert.equal(
    typeof subject.shouldShowAdminViewLoading,
    "function",
    "VIEW AS must expose a shared loading-state rule",
  );

  const transitions = [
    ["/dashboard/admin", "startup"],
    ["/dashboard/admin", "mentor"],
    ["/dashboard/admin/preview/startup", "admin"],
    ["/dashboard/admin/preview/startup", "mentor"],
    ["/dashboard/admin/preview/mentor", "admin"],
    ["/dashboard/admin/preview/mentor", "startup"],
  ] as const;

  for (const [pathname, destination] of transitions) {
    assert.equal(subject.shouldShowAdminViewLoading(pathname, destination), true);
  }

  assert.equal(subject.shouldShowAdminViewLoading("/dashboard/admin", "admin"), false);
  assert.equal(subject.shouldShowAdminViewLoading("/dashboard/admin/preview/startup", "startup"), false);
  assert.equal(subject.shouldShowAdminViewLoading("/dashboard/admin/preview/mentor", "mentor"), false);
  assert.equal(subject.shouldShowAdminViewLoading("/dashboard/admin", null), false);
});

test("VIEW AS loading always presents a disabled admin sidebar", async () => {
  const subject = await import("../../src/dashboard/participant-preview.ts").catch(() => null);
  assert.ok(subject, "the participant preview module must exist");
  assert.equal(
    typeof subject.resolveAdminViewTransition,
    "function",
    "VIEW AS must expose a shared transition presentation",
  );

  assert.deepEqual(
    subject.resolveAdminViewTransition("/dashboard/admin", "startup", true),
    {
      loading: true,
      selectedView: "startup",
      sidebarView: "admin",
      sidebarInteractive: false,
    },
  );
  assert.deepEqual(
    subject.resolveAdminViewTransition("/dashboard/admin/preview/startup", "mentor", true),
    {
      loading: true,
      selectedView: "mentor",
      sidebarView: "admin",
      sidebarInteractive: false,
    },
  );
  assert.deepEqual(
    subject.resolveAdminViewTransition("/dashboard/admin", "startup", false),
    {
      loading: false,
      selectedView: "admin",
      sidebarView: "admin",
      sidebarInteractive: true,
    },
  );
});

test("startup preview is fictional and includes interactive dashboard content", async () => {
  const subject = await import("../../src/dashboard/participant-preview.ts").catch(() => null);
  assert.ok(subject, "the participant preview module must exist");

  const preview = subject.buildParticipantPreview("startup", "2026-09-01T12:00:00Z");

  assert.equal(preview.role, "startup");
  assert.equal(preview.identity.fullName, "Nadia Rahman");
  assert.equal(preview.identity.email, "nadia@northstar.demo");
  assert.equal(preview.semester.name, "Demo Semester");
  assert.equal(preview.sessions.some((session) => session.timing === "upcoming"), true);
  assert.equal(preview.sessions.some((session) => session.timing === "past"), true);
  assert.equal(preview.network.every((entry) => entry.kind === "mentor"), true);
});

test("mentor preview switches identity and participant perspective", async () => {
  const subject = await import("../../src/dashboard/participant-preview.ts").catch(() => null);
  assert.ok(subject, "the participant preview module must exist");

  const preview = subject.buildParticipantPreview("mentor", "2026-09-01T12:00:00Z");

  assert.equal(preview.role, "mentor");
  assert.equal(preview.identity.fullName, "Maya Chen");
  assert.equal(preview.identity.email, "maya@helio.demo");
  assert.equal(preview.network.every((entry) => entry.kind === "startup"), true);
});
