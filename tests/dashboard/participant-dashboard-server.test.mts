import assert from "node:assert/strict";
import test from "node:test";

import { createParticipantDashboardService } from "../../src/dashboard/participant-dashboard-server.ts";

test("pending accounts receive no participant data before an active-semester membership exists", async () => {
  const service = createParticipantDashboardService({
    load: async () => ({
      activeSemester: { id: "fall", name: "Fall 2026" },
      memberships: [],
      identity: { profileId: "person", fullName: "Test Founder", email: "founder@example.com", emailVerified: true },
      startupSemesterId: null,
      mentorSemesterId: null,
      profileComplete: false,
      roleSetupComplete: false,
      sessions: [],
      network: [],
    }),
    updateProfile: async () => undefined,
  }, () => "2026-09-01T12:00:00Z");

  assert.deepEqual(await service.load("person"), {
    state: "pending",
    semester: { id: "fall", name: "Fall 2026" },
  });
});

test("profile updates are sanitized before reaching the RLS repository", async () => {
  let captured: unknown = null;
  const service = createParticipantDashboardService({
    load: async () => ({
      activeSemester: { id: "fall", name: "Fall 2026" },
      memberships: [{ id: "member", semesterId: "fall", profileId: "person", role: "startup", status: "active" }],
      identity: { profileId: "person", fullName: "Founder", email: "founder@example.com", emailVerified: true },
      startupSemesterId: "startup",
      mentorSemesterId: null,
      profileComplete: true,
      roleSetupComplete: true,
      sessions: [],
      network: [],
    }),
    updateProfile: async (_profileId, _context, payload) => { captured = payload; },
  }, () => "2026-09-01T12:00:00Z");

  await service.update("person", {
    fullName: " Founder Name ", headline: " Pricing help ", summary: " Building tools. ",
    tags: "Pricing, B2B", websiteUrl: "ignored.example", linkedinUrl: "ignored",
  });

  assert.deepEqual(captured, {
    profile: { full_name: "Founder Name" },
    startupSemester: {
      company_snapshot: "Building tools.",
      mentor_need_context: "Pricing help",
    },
  });
});
