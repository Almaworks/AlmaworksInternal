import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createParticipantDashboardService } from "../../src/dashboard/participant-dashboard-server.ts";

test("dashboard snapshots decorate derived notifications with persisted read keys", async () => {
  const service = createParticipantDashboardService({
    load: async () => ({
      activeSemester: { id: "fall", name: "Fall 2026" },
      memberships: [{ id: "member", semesterId: "fall", profileId: "person", role: "mentor", status: "active" }],
      identity: { profileId: "person", fullName: "Mentor", email: "mentor@example.com", emailVerified: true },
      startupSemesterId: null,
      mentorSemesterId: "mentor-term",
      profileComplete: true,
      roleSetupComplete: true,
      sessions: [{
        id: "session-1", semesterId: "fall", mentorSemesterId: "mentor-term", startupSemesterId: "startup-term",
        partnerName: "Northstar", meetingDate: "2026-09-11", startsAt: "15:30", endsAt: "16:15",
        topic: null, format: "remote", status: "confirmed",
      }],
      network: [],
      readNotificationKeys: ["session-session-1-confirmed"],
    }),
    updateProfile: async () => undefined,
  }, () => "2026-09-06T12:00:00Z");

  const result = await service.load("person");
  assert.equal(result.state, "participant");
  if (result.state !== "participant") return;
  assert.deepEqual(result.notifications.map(({ key, read }) => [key, read]), [
    ["session-session-1-confirmed", true],
  ]);
});

test("dashboard loader reads caller receipts for only the active semester", async () => {
  const source = await readFile("app/api/participant-dashboard/route.ts", "utf8");

  assert.match(source, /from\("participant_notification_reads"\)/u);
  assert.match(source, /select\("notification_key"\)/u);
  assert.match(source, /\.eq\("profile_id", profileId\)/u);
  assert.match(source, /\.eq\("semester_id", activeSemester\.id\)/u);
  assert.match(source, /base\.readNotificationKeys\s*=/u);
});

test("participant UI persists non-preview reads and rolls back only the failed key", async () => {
  const [source, persistenceSource] = await Promise.all([
    readFile("app/dashboard/participant/ParticipantDashboard.tsx", "utf8"),
    readFile("src/dashboard/participant-notification-read.ts", "utf8"),
  ]);

  assert.match(source, /persistParticipantNotificationRead/u);
  assert.match(persistenceSource, /\/api\/participant-notifications\/read/u);
  assert.match(source, /pendingNotificationReadsRef/u);
  assert.match(source, /locallyReadNotificationKeysRef/u);
  assert.match(source, /participantNotificationReadCacheKey/u);
  assert.match(source, /current\.identity\.profileId !== scope\.profileId/u);
  assert.match(source, /current\.semester\.id !== scope\.semesterId/u);
  assert.match(source, /notification\.key === notice\.key\s*\?\s*\{ \.\.\.notification, read: false \}/u);
  assert.match(source, /notificationReadFailure/u);
  assert.match(source, /Retry/u);
});
