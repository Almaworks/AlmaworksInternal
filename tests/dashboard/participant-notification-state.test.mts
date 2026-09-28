import assert from "node:assert/strict";
import test from "node:test";

import { markParticipantNotificationRead, type ParticipantDashboardView } from "../../src/dashboard/participant-dashboard.ts";

const view = {
  state: "participant",
  role: "mentor",
  membershipStatus: "active",
  semester: { id: "fall-2026", name: "Fall 2026" },
  startupSemesterId: null,
  weeklyAvailability: [],
  upcomingMeetings: [],
  identity: { profileId: "mentor-1", fullName: "Maya Chen", email: "maya@example.com", emailVerified: true, photoUrl: null },
  activation: [],
  network: [],
  startups: [],
  notifications: [
    { id: "profile", key: "activation-profile", kind: "activation", title: "Continue account setup", body: "Complete profile", createdAt: "2026-09-02T00:00:00Z", read: false, destination: "profile" },
  ],
  profile: { headline: "", summary: "", tags: [], websiteUrl: "", linkedinUrl: "" },
  mentorNeeds: null,
} satisfies ParticipantDashboardView;

test("opening a notice marks only its key as read without removing other notices", () => {
  const next = markParticipantNotificationRead(view, "activation-profile");

  assert.deepEqual(next.notifications.map((notice) => [notice.key, notice.read]), [
    ["activation-profile", true],
  ]);
});
