import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createParticipantDashboardService } from "../../src/dashboard/participant-dashboard-server.ts";

test("mentor dashboard availability is matched against the signed-in profile after the canonical relationship is loaded", () => {
  const route = readFileSync(new URL("../../src/dashboard/participant-snapshot-loader.ts", import.meta.url), "utf8");

  assert.match(route, /from\("mentor_weekly_availability"\)[\s\S]*?mentor_semesters!inner\(semester_memberships!inner\(profile_id\)\)/u);
  assert.match(route, /weeklyAvailabilityForProfile\(weeklyAvailabilityResult\.data \?\? \[\], profileId\)/u);
});

test("participant dashboard responses explicitly prevent private snapshot caching", () => {
  const route = readFileSync(new URL("../../app/api/participant-dashboard/route.ts", import.meta.url), "utf8");

  assert.match(route, /const PRIVATE_NO_STORE_HEADERS = \{ "Cache-Control": "private, no-store" \}/u);
  assert.match(route, /NextResponse\.json\(\{ error: message \}, \{ status, headers: PRIVATE_NO_STORE_HEADERS \}\)/u);
  assert.match(route, /\{ data: await service\.load\(auth\.profileId\) \},[\s\S]*?\{ headers: PRIVATE_NO_STORE_HEADERS \}/u);
});

test("a mentor dashboard includes future accepted booking requests as upcoming meetings", async () => {
  const service = createParticipantDashboardService({
    load: async () => ({
      activeSemester: { id: "fall", name: "Fall 2026" },
      memberships: [{ id: "mentor-membership", semesterId: "fall", profileId: "person", role: "mentor", status: "active" }],
      identity: { profileId: "person", fullName: "Mentor", email: "mentor@example.com", emailVerified: true, photoUrl: null },
      startupSemesterId: null,
      mentorSemesterId: "mentor-semester",
      weeklyAvailability: [],
      upcomingMeetings: [{ startsAt: "2026-10-12T15:00:00Z", endsAt: "2026-10-12T15:30:00Z", counterpartName: "Northstar Labs", topic: "Pricing strategy" }],
      profileComplete: true,
      roleSetupComplete: true,
      network: [],
    }),
    updateProfile: async () => undefined,
  });

  const dashboard = await service.load("person");
  assert.equal(dashboard.state, "participant");
  if (dashboard.state !== "participant") return;
  assert.deepEqual(dashboard.upcomingMeetings, [{ startsAt: "2026-10-12T15:00:00Z", endsAt: "2026-10-12T15:30:00Z", counterpartName: "Northstar Labs", topic: "Pricing strategy" }]);
});

test("dashboard loader derives booking notices from role-scoped booking requests", () => {
  const route = readFileSync(new URL("../../src/dashboard/participant-snapshot-loader.ts", import.meta.url), "utf8");

  assert.match(route, /from\("mentor_booking_requests"\)[\s\S]*?\.eq\("mentor_profile_id", profileId\)[\s\S]*?\.in\("status", \["pending", "accepted", "declined", "cancelled"\]\)/u);
  assert.match(route, /from\("mentor_booking_requests"\)[\s\S]*?\.eq\("startup_semester_id", startupSemesterId\)[\s\S]*?\.in\("status", \["accepted", "declined"\]\)/u);
  assert.match(route, /base\.bookingNotifications\s*=/u);
});

test("a startup dashboard includes its future accepted booking requests as upcoming meetings", async () => {
  const service = createParticipantDashboardService({
    load: async () => ({
      activeSemester: { id: "fall", name: "Fall 2026" },
      memberships: [{ id: "startup-membership", semesterId: "fall", profileId: "person", role: "startup", status: "active" }],
      identity: { profileId: "person", fullName: "Founder", email: "founder@example.com", emailVerified: true, photoUrl: null },
      startupSemesterId: "northstar",
      mentorSemesterId: null,
      weeklyAvailability: [],
      upcomingMeetings: [{ startsAt: "2026-10-12T15:00:00Z", endsAt: "2026-10-12T15:30:00Z", counterpartName: "Maya Chen", topic: "Pricing strategy" }],
      profileComplete: true,
      roleSetupComplete: true,
      network: [],
    }),
    updateProfile: async () => undefined,
  });

  const dashboard = await service.load("person");
  assert.equal(dashboard.state, "participant");
  if (dashboard.state !== "participant") return;
  assert.deepEqual(dashboard.upcomingMeetings, [{ startsAt: "2026-10-12T15:00:00Z", endsAt: "2026-10-12T15:30:00Z", counterpartName: "Maya Chen", topic: "Pricing strategy" }]);
});

test("pending accounts receive no participant data before an active-semester membership exists", async () => {
  const service = createParticipantDashboardService({
    load: async () => ({
      activeSemester: { id: "fall", name: "Fall 2026" },
      memberships: [],
      identity: { profileId: "person", fullName: "Test Founder", email: "founder@example.com", emailVerified: true, photoUrl: null },
      startupSemesterId: null,
      mentorSemesterId: null,
      profileComplete: false,
      roleSetupComplete: false,
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
      identity: { profileId: "person", fullName: "Founder", email: "founder@example.com", emailVerified: true, photoUrl: null },
      startupSemesterId: "startup",
      mentorSemesterId: null,
      profileComplete: true,
      roleSetupComplete: true,
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

test("a mentor dashboard retains its own weekly availability when the same profile is also an administrator", async () => {
  const service = createParticipantDashboardService({
    load: async () => ({
      activeSemester: { id: "fall", name: "Fall 2026" },
      memberships: [
        { id: "admin-membership", semesterId: "fall", profileId: "person", role: "admin", status: "active" },
        { id: "mentor-membership", semesterId: "fall", profileId: "person", role: "mentor", status: "active" },
      ],
      identity: { profileId: "person", fullName: "Mentor Admin", email: "mentor@example.com", emailVerified: true, photoUrl: null },
      startupSemesterId: null,
      mentorSemesterId: "mentor-semester",
      weeklyAvailability: [{ weekday: 1, startsAt: "11:15", endsAt: "12:00" }],
      profileComplete: true,
      roleSetupComplete: true,
      network: [],
    }),
    updateProfile: async () => undefined,
  });

  const dashboard = await service.load("person");

  assert.equal(dashboard.state, "participant");
  if (dashboard.state !== "participant") return;
  assert.equal(dashboard.role, "mentor");
  assert.deepEqual(dashboard.weeklyAvailability, [{ weekday: 1, startsAt: "11:15", endsAt: "12:00" }]);
});
