import assert from "node:assert/strict";
import test from "node:test";

import {
  buildActivationSteps,
  buildParticipantDashboard,
  buildProfileUpdate,
  buildStartupProfileUpdate,
  selectParticipantContext,
  scopeParticipantDashboard,
  unreadNotificationCount,
  type ParticipantDashboardSource,
} from "../../src/dashboard/participant-dashboard.ts";

const source: ParticipantDashboardSource = {
  notifications: [
    { id: "mine", semesterId: "current", recipientProfileIds: ["mentor-me"], startupSemesterId: null, title: "Welcome", body: "Visible.", createdAt: "2026-09-01T14:00:00Z", read: false },
    { id: "team", semesterId: "current", recipientProfileIds: [], startupSemesterId: "startup-me", title: "Team update", body: "Visible.", createdAt: "2026-09-01T13:00:00Z", read: false },
    { id: "other", semesterId: "current", recipientProfileIds: ["someone-else"], startupSemesterId: null, title: "Private", body: "Hidden.", createdAt: "2026-09-01T12:00:00Z", read: false },
  ],
  network: [
    { id: "mentor-current", semesterId: "current", kind: "mentor", name: "Avery Morgan", headline: "Revenue leader", tags: ["Sales"], summary: "Helps teams." },
    { id: "startup-current", semesterId: "current", kind: "startup", name: "Northstar Labs", headline: "Climate intelligence", tags: ["Climate"], summary: "Decision tools." },
  ],
};

test("participant dashboard scopes notifications and cohort network without session data", () => {
  const mentor = scopeParticipantDashboard({ role: "mentor", profileId: "mentor-me", startupSemesterId: null, activeSemesterId: "current", source });
  const startup = scopeParticipantDashboard({ role: "startup", profileId: "founder-me", startupSemesterId: "startup-me", activeSemesterId: "current", source });

  assert.deepEqual(mentor.notifications.map((item) => item.id), ["mine"]);
  assert.deepEqual(mentor.network.map((item) => item.id), ["startup-current"]);
  assert.deepEqual(startup.notifications.map((item) => item.id), ["team"]);
  assert.deepEqual(startup.network.map((item) => item.id), ["mentor-current", "startup-current"]);
  assert.equal("sessions" in mentor, false);
});

test("activation checklist derives role-specific readiness after account creation", () => {
  const mentor = buildActivationSteps("mentor", { emailVerified: true, profileComplete: true, semesterActive: true, roleSetupComplete: false });
  const startup = buildActivationSteps("startup", { emailVerified: true, profileComplete: false, semesterActive: false, roleSetupComplete: false });

  assert.deepEqual(mentor.map((step) => [step.id, step.status]), [["email", "complete"], ["profile", "complete"], ["semester", "complete"]]);
  assert.deepEqual(startup.map((step) => [step.id, step.status]), [["email", "complete"], ["profile", "current"], ["semester", "locked"], ["mentor-needs", "locked"]]);
});

test("selects only a supported membership in the active semester", () => {
  assert.deepEqual(selectParticipantContext({
    activeSemester: { id: "fall", name: "Fall 2026" },
    memberships: [{ id: "active", semesterId: "fall", profileId: "person", role: "startup", status: "onboarding" }],
  }), { kind: "participant", semesterId: "fall", semesterName: "Fall 2026", membershipId: "active", role: "startup", status: "onboarding" });
});

test("prefers an active mentor membership when a profile is also an active startup", () => {
  assert.deepEqual(selectParticipantContext({
    activeSemester: { id: "fall", name: "Fall 2026" },
    memberships: [
      { id: "startup", semesterId: "fall", profileId: "person", role: "startup", status: "active" },
      { id: "mentor", semesterId: "fall", profileId: "person", role: "mentor", status: "active" },
    ],
  }), { kind: "participant", semesterId: "fall", semesterName: "Fall 2026", membershipId: "mentor", role: "mentor", status: "active" });
});

test("participant dashboards do not expose legacy mentorship sessions or session notifications", () => {
  const dashboard = buildParticipantDashboard({
    now: "2026-09-05T12:00:00Z",
    context: { kind: "participant", semesterId: "fall", semesterName: "Fall 2026", membershipId: "member", role: "startup", status: "active" },
    identity: { profileId: "founder", fullName: "Nadia Rahman", email: "nadia@example.com", emailVerified: true, photoUrl: null },
    startupSemesterId: "startup-me",
    mentorSemesterId: null,
    profileComplete: true,
    roleSetupComplete: true,
    network: [],
  });

  assert.equal("sessions" in dashboard, false);
  assert.equal(dashboard.notifications.some((notice) => notice.kind === "session"), false);
  assert.equal(unreadNotificationCount(dashboard), 0);
});

test("mentor and startup booking lifecycle notices are derived for the correct booking state", () => {
  const mentor = buildParticipantDashboard({
    now: "2026-09-11T12:00:00Z",
    context: { kind: "participant", semesterId: "fall", semesterName: "Fall 2026", membershipId: "mentor-member", role: "mentor", status: "active" },
    identity: { profileId: "mentor", fullName: "Maya Chen", email: "maya@example.com", emailVerified: true, photoUrl: null },
    startupSemesterId: null,
    mentorSemesterId: "mentor-semester",
    bookingNotifications: [{ requestId: "request-1", status: "pending", counterpartName: "Northstar Labs", topic: "Pricing strategy", createdAt: "2026-09-11T11:00:00Z", durationMinutes: 30 }],
    profileComplete: true,
    roleSetupComplete: true,
    network: [],
  });
  const startup = buildParticipantDashboard({
    now: "2026-09-11T12:00:00Z",
    context: { kind: "participant", semesterId: "fall", semesterName: "Fall 2026", membershipId: "startup-member", role: "startup", status: "active" },
    identity: { profileId: "founder", fullName: "Nadia Rahman", email: "nadia@example.com", emailVerified: true, photoUrl: null },
    startupSemesterId: "northstar",
    mentorSemesterId: null,
    bookingNotifications: [{ requestId: "request-1", status: "accepted", counterpartName: "Maya Chen", topic: "Pricing strategy", createdAt: "2026-09-11T11:30:00Z" }],
    profileComplete: true,
    roleSetupComplete: true,
    network: [],
  });

  assert.deepEqual(mentor.notifications.map(({ key, kind, title, body, destination }) => [key, kind, title, body, destination]), [[
    "mentor-booking-request-1-pending", "session", "New meeting request", "Northstar Labs requested a 30-minute meeting about Pricing strategy.", "bookings",
  ]]);
  assert.deepEqual(startup.notifications.map(({ key, kind, title, body, destination }) => [key, kind, title, body, destination]), [[
    "mentor-booking-request-1-accepted", "session", "Meeting request accepted", "Maya Chen accepted your meeting request about Pricing strategy.", "bookings",
  ]]);
});

test("mentor request notices persist after the booking leaves pending and keep independent read state", () => {
  const dashboard = buildParticipantDashboard({
    now: "2026-09-11T12:00:00Z",
    context: { kind: "participant", semesterId: "fall", semesterName: "Fall 2026", membershipId: "mentor-member", role: "mentor", status: "active" },
    identity: { profileId: "mentor", fullName: "Maya Chen", email: "maya@example.com", emailVerified: true, photoUrl: null },
    startupSemesterId: null,
    mentorSemesterId: "mentor-semester",
    bookingNotifications: [
      { requestId: "request-2", status: "pending", counterpartName: "Second Startup", topic: "Fundraising", createdAt: "2026-09-11T11:30:00Z" },
      { requestId: "request-1", status: "accepted", counterpartName: "Northstar Labs", topic: "Pricing strategy", createdAt: "2026-09-11T11:00:00Z" },
    ],
    profileComplete: true,
    roleSetupComplete: true,
    network: [],
    readNotificationKeys: ["mentor-booking-request-1-pending"],
  });

  assert.deepEqual(dashboard.notifications.map(({ key, title, body, read }) => [key, title, body, read]), [
    ["mentor-booking-request-2-pending", "New meeting request", "Second Startup requested a meeting about Fundraising.", false],
    ["mentor-booking-request-1-pending", "New meeting request", "Northstar Labs requested a meeting about Pricing strategy.", true],
  ]);
});

test("declined booking notices retain a participant's persisted read state", () => {
  const dashboard = buildParticipantDashboard({
    now: "2026-09-11T12:00:00Z",
    context: { kind: "participant", semesterId: "fall", semesterName: "Fall 2026", membershipId: "startup-member", role: "startup", status: "active" },
    identity: { profileId: "founder", fullName: "Nadia Rahman", email: "nadia@example.com", emailVerified: true, photoUrl: null },
    startupSemesterId: "northstar",
    mentorSemesterId: null,
    bookingNotifications: [{ requestId: "request-2", status: "declined", counterpartName: "Maya Chen", topic: "", createdAt: "2026-09-11T11:30:00Z" }],
    profileComplete: true,
    roleSetupComplete: true,
    network: [],
    readNotificationKeys: ["mentor-booking-request-2-declined"],
  });

  assert.deepEqual(dashboard.notifications.map(({ key, title, body, read }) => [key, title, body, read]), [[
    "mentor-booking-request-2-declined", "Meeting request declined", "Maya Chen declined your meeting request.", true,
  ]]);
});

test("startup dashboards retain upcoming accepted independent bookings", () => {
  const dashboard = buildParticipantDashboard({
    now: "2026-09-11T12:00:00Z",
    context: { kind: "participant", semesterId: "fall", semesterName: "Fall 2026", membershipId: "startup-member", role: "startup", status: "active" },
    identity: { profileId: "founder", fullName: "Nadia Rahman", email: "nadia@example.com", emailVerified: true, photoUrl: null },
    startupSemesterId: "northstar",
    mentorSemesterId: null,
    upcomingMeetings: [{ startsAt: "2026-10-12T15:00:00Z", endsAt: "2026-10-12T15:30:00Z", counterpartName: "Maya Chen", topic: "Pricing strategy" }],
    profileComplete: true,
    roleSetupComplete: true,
    network: [],
  });

  assert.deepEqual(dashboard.upcomingMeetings, [{ startsAt: "2026-10-12T15:00:00Z", endsAt: "2026-10-12T15:30:00Z", counterpartName: "Maya Chen", topic: "Pricing strategy" }]);
});

test("mentor profile updates keep title and company separate", () => {
  assert.deepEqual(buildProfileUpdate("mentor", {
    fullName: " Maya Chen ", headline: " VP Revenue ", company: " Independent ", summary: " Helps founders grow. ", tags: "Sales, Growth, sales", websiteUrl: " https://example.com ", linkedinUrl: " linkedin.com/in/maya ",
  }), { profile: { full_name: "Maya Chen" }, mentorProfile: { title: "VP Revenue", company: "Independent", biography: "Helps founders grow.", expertise_tags: ["Sales", "Growth"], website_url: "https://example.com", linkedin_url: "linkedin.com/in/maya" } });
});

test("startup profile updates keep shared organization and semester fields separate", () => {
  assert.deepEqual(buildStartupProfileUpdate({
    name: " Acme ", industry: " FinTech ", stage: "mvp", description: " Payments for student founders. ", websiteUrl: " https://acme.example ",
  }), {
    organization: { name: "Acme", industry: "FinTech", description: "Payments for student founders.", website_url: "https://acme.example" },
    startupSemester: { stage: "mvp" },
  });
});
