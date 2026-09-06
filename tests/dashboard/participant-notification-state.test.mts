import assert from "node:assert/strict";
import test from "node:test";

import { markParticipantNotificationRead, type ParticipantDashboardView } from "../../src/dashboard/participant-dashboard.ts";

const view = {
  state: "participant",
  role: "mentor",
  membershipStatus: "active",
  semester: { id: "fall-2026", name: "Fall 2026" },
  identity: { profileId: "mentor-1", fullName: "Maya Chen", email: "maya@example.com", emailVerified: true },
  activation: [],
  sessions: [],
  network: [],
  notifications: [
    { id: "session-1", key: "session-1-confirmed", kind: "session", title: "Session confirmed", body: "Northstar", createdAt: "2026-09-01T00:00:00Z", read: false, destination: "sessions" },
    { id: "availability", key: "activation-availability", kind: "activation", title: "Continue account setup", body: "Add availability", createdAt: "2026-09-02T00:00:00Z", read: false, destination: "availability" },
  ],
  profile: { headline: "", summary: "", tags: [], websiteUrl: "", linkedinUrl: "" },
  mentorNeeds: null,
  availability: [],
} satisfies ParticipantDashboardView;

test("opening a notice marks only its key as read without removing other notices", () => {
  const next = markParticipantNotificationRead(view, "session-1-confirmed");

  assert.deepEqual(next.notifications.map((notice) => [notice.key, notice.read]), [
    ["session-1-confirmed", true],
    ["activation-availability", false],
  ]);
});
