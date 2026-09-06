import assert from "node:assert/strict";
import test from "node:test";

import {
  buildActivationSteps,
  buildParticipantDashboard,
  buildProfileUpdate,
  selectParticipantContext,
  scopeParticipantDashboard,
  unreadNotificationCount,
  type ParticipantDashboardSource,
} from "../../src/dashboard/participant-dashboard.ts";

const source: ParticipantDashboardSource = {
  notifications: [
    { id: "mine", semesterId: "current", recipientProfileIds: ["mentor-me"], startupSemesterId: null, title: "Session confirmed", body: "You are confirmed with Northstar.", createdAt: "2026-09-01T14:00:00Z", read: false },
    { id: "team", semesterId: "current", recipientProfileIds: [], startupSemesterId: "startup-me", title: "Mentor matched", body: "A mentor was matched to your team.", createdAt: "2026-09-01T13:00:00Z", read: false },
    { id: "other", semesterId: "current", recipientProfileIds: ["someone-else"], startupSemesterId: null, title: "Private alert", body: "Not visible.", createdAt: "2026-09-01T12:00:00Z", read: false },
    { id: "prior", semesterId: "prior", recipientProfileIds: ["mentor-me"], startupSemesterId: null, title: "Old semester", body: "Not visible.", createdAt: "2026-01-01T12:00:00Z", read: true },
  ],
  sessions: [
    { id: "mentor-own", semesterId: "current", mentorProfileId: "mentor-me", startupSemesterId: "startup-other", partnerName: "Northstar Labs", date: "2026-09-11", topic: "Enterprise sales", format: "In person", status: "confirmed" },
    { id: "startup-own", semesterId: "current", mentorProfileId: "mentor-other", startupSemesterId: "startup-me", partnerName: "Avery Morgan", date: "2026-09-04", topic: "Fundraising", format: "Online", status: "completed" },
    { id: "other-session", semesterId: "current", mentorProfileId: "mentor-other", startupSemesterId: "startup-other", partnerName: "Private", date: "2026-09-04", topic: "Private", format: "Online", status: "completed" },
    { id: "prior-own", semesterId: "prior", mentorProfileId: "mentor-me", startupSemesterId: "startup-old", partnerName: "Prior cohort", date: "2026-01-09", topic: "Old", format: "Online", status: "completed" },
  ],
  network: [
    { id: "mentor-current", semesterId: "current", kind: "mentor", name: "Avery Morgan", headline: "Revenue leader", tags: ["Sales"], summary: "Helps teams build repeatable sales systems." },
    { id: "startup-current", semesterId: "current", kind: "startup", name: "Northstar Labs", headline: "Climate intelligence", tags: ["Climate"], summary: "Decision tools for climate operations." },
    { id: "mentor-prior", semesterId: "prior", kind: "mentor", name: "Prior Mentor", headline: "Hidden", tags: [], summary: "Hidden" },
  ],
};

test("mentor dashboard exposes only the mentor's current-semester records and active startups", () => {
  const dashboard = scopeParticipantDashboard({ role: "mentor", profileId: "mentor-me", startupSemesterId: null, activeSemesterId: "current", source });

  assert.deepEqual(dashboard.notifications.map((item) => item.id), ["mine"]);
  assert.deepEqual(dashboard.sessions.map((item) => item.id), ["mentor-own"]);
  assert.deepEqual(dashboard.network.map((item) => item.id), ["startup-current"]);
});

test("startup dashboard exposes team notifications, its own current-semester sessions, and active mentors", () => {
  const dashboard = scopeParticipantDashboard({ role: "startup", profileId: "founder-me", startupSemesterId: "startup-me", activeSemesterId: "current", source });

  assert.deepEqual(dashboard.notifications.map((item) => item.id), ["team"]);
  assert.deepEqual(dashboard.sessions.map((item) => item.id), ["startup-own"]);
  assert.deepEqual(dashboard.network.map((item) => item.id), ["mentor-current"]);
});

test("activation checklist derives role-specific readiness after account creation", () => {
  const mentor = buildActivationSteps("mentor", { emailVerified: true, profileComplete: true, semesterActive: true, roleSetupComplete: false });
  const startup = buildActivationSteps("startup", { emailVerified: true, profileComplete: false, semesterActive: false, roleSetupComplete: false });

  assert.deepEqual(mentor.map((step) => [step.id, step.status]), [
    ["email", "complete"],
    ["profile", "complete"],
    ["semester", "complete"],
    ["availability", "current"],
  ]);
  assert.deepEqual(startup.map((step) => [step.id, step.status]), [
    ["email", "complete"],
    ["profile", "current"],
    ["semester", "locked"],
    ["mentor-needs", "locked"],
  ]);
});

test("selects only a supported membership in the active semester", () => {
  assert.deepEqual(selectParticipantContext({
    activeSemester: { id: "fall", name: "Fall 2026" },
    memberships: [
      { id: "old", semesterId: "spring", profileId: "person", role: "mentor", status: "alumni" },
      { id: "active", semesterId: "fall", profileId: "person", role: "startup", status: "onboarding" },
    ],
  }), {
    kind: "participant",
    semesterId: "fall",
    semesterName: "Fall 2026",
    membershipId: "active",
    role: "startup",
    status: "onboarding",
  });

  assert.deepEqual(selectParticipantContext({ activeSemester: { id: "fall", name: "Fall 2026" }, memberships: [] }), {
    kind: "pending",
    semesterId: "fall",
    semesterName: "Fall 2026",
  });
});

test("builds a startup dashboard from only owned active-semester sessions", () => {
  const dashboard = buildParticipantDashboard({
    now: "2026-09-05T12:00:00Z",
    context: { kind: "participant", semesterId: "fall", semesterName: "Fall 2026", membershipId: "member", role: "startup", status: "active" },
    identity: { profileId: "founder", fullName: "Nadia Rahman", email: "nadia@example.com", emailVerified: true },
    startupSemesterId: "startup-me",
    mentorSemesterId: null,
    profileComplete: true,
    roleSetupComplete: true,
    sessions: [
      { id: "mine-past", semesterId: "fall", mentorSemesterId: "mentor-a", startupSemesterId: "startup-me", partnerName: "Maya Chen", meetingDate: "2026-08-28", startsAt: "15:30", endsAt: "16:15", topic: "Pricing", format: "Online", status: "confirmed" },
      { id: "other", semesterId: "fall", mentorSemesterId: "mentor-b", startupSemesterId: "startup-other", partnerName: "Private", meetingDate: "2026-09-11", startsAt: "15:30", endsAt: "16:15", topic: null, format: null, status: "confirmed" },
      { id: "prior", semesterId: "spring", mentorSemesterId: "mentor-a", startupSemesterId: "startup-me", partnerName: "Prior", meetingDate: "2026-03-01", startsAt: "15:30", endsAt: "16:15", topic: null, format: null, status: "confirmed" },
    ],
    network: [{ id: "mentor-card", semesterId: "fall", kind: "mentor", name: "Maya Chen", headline: "VP Revenue", tags: ["Sales"], summary: "Revenue leader", websiteUrl: null, photoUrl: null }],
  });

  assert.deepEqual(dashboard.sessions.map((session) => [session.id, session.timing]), [["mine-past", "past"]]);
  assert.deepEqual(dashboard.network.map((entry) => entry.id), ["mentor-card"]);
  assert.equal(dashboard.notifications.some((notice) => notice.kind === "session"), true);
  assert.equal(dashboard.activation.every((step) => step.status === "complete"), true);
});

test("projects exact session timing, own RSVP, visible attendees, and startup Mentor Needs", () => {
  const dashboard = buildParticipantDashboard({
    now: "2026-09-04T19:00:00.000Z",
    context: { kind: "participant", semesterId: "fall", semesterName: "Fall 2026", membershipId: "founder-member", role: "startup", status: "active" },
    identity: { profileId: "founder", fullName: "Nadia Rahman", email: "nadia@example.com", emailVerified: true },
    startupSemesterId: "startup-me",
    mentorSemesterId: null,
    profileComplete: true,
    roleSetupComplete: true,
    mentorNeeds: { needs: ["Enterprise sales", "Pricing"], context: "Prepare for our first enterprise pilot.", noPreference: false },
    sessions: [{
      id: "next-session",
      semesterId: "fall",
      mentorSemesterId: "mentor-a",
      startupSemesterId: "startup-me",
      partnerName: "Maya Chen",
      meetingDate: "2026-09-04",
      startsAt: "15:30",
      endsAt: "16:15",
      timezone: "America/New_York",
      topic: "Enterprise sales",
      format: "In person",
      status: "confirmed",
      attendees: [
        { semesterMembershipId: "mentor-member", profileId: "mentor", fullName: "Maya Chen", role: "mentor", response: "attending", respondedAt: "2026-09-01T12:00:00Z", updatedAt: "2026-09-01T12:00:00Z" },
        { semesterMembershipId: "founder-member", profileId: "founder", fullName: "Nadia Rahman", role: "startup", response: "no_response", respondedAt: null, updatedAt: null },
      ],
    }],
    network: [],
  });

  assert.deepEqual(dashboard.mentorNeeds, { needs: ["Enterprise sales", "Pricing"], context: "Prepare for our first enterprise pilot.", noPreference: false });
  assert.equal(dashboard.sessions[0]?.sessionStartsAt, "2026-09-04T19:30:00.000Z");
  assert.equal(dashboard.sessions[0]?.timing, "upcoming");
  assert.equal(dashboard.sessions[0]?.rsvpOpen, true);
  assert.equal(dashboard.sessions[0]?.ownRsvp, "no_response");
  assert.deepEqual(dashboard.sessions[0]?.attendees.map((attendee) => attendee.fullName), ["Maya Chen", "Nadia Rahman"]);
});

test("locks a session at its exact start and does not expose Mentor Needs to mentors", () => {
  const dashboard = buildParticipantDashboard({
    now: "2026-09-04T19:30:00.000Z",
    context: { kind: "participant", semesterId: "fall", semesterName: "Fall 2026", membershipId: "mentor-member", role: "mentor", status: "active" },
    identity: { profileId: "mentor", fullName: "Maya Chen", email: "maya@example.com", emailVerified: true },
    startupSemesterId: null,
    mentorSemesterId: "mentor-a",
    profileComplete: true,
    roleSetupComplete: true,
    mentorNeeds: { needs: ["Hidden"], context: null, noPreference: false },
    sessions: [{
      id: "starting-session", semesterId: "fall", mentorSemesterId: "mentor-a", startupSemesterId: "startup-me", partnerName: "Northstar",
      meetingDate: "2026-09-04", startsAt: "15:30", endsAt: "16:15", timezone: "America/New_York", topic: null, format: null, status: "confirmed",
    }],
    network: [],
  });

  assert.equal(dashboard.mentorNeeds, null);
  assert.equal(dashboard.sessions[0]?.timing, "past");
  assert.equal(dashboard.sessions[0]?.rsvpOpen, false);
});

test("notification receipts use lifecycle keys", () => {
  const dashboard = buildParticipantDashboard({
    now: "2026-09-05T12:00:00Z",
    context: { kind: "participant", semesterId: "fall", semesterName: "Fall 2026", membershipId: "member", role: "startup", status: "active" },
    identity: { profileId: "founder", fullName: "Nadia Rahman", email: "nadia@example.com", emailVerified: true },
    startupSemesterId: "startup-me",
    mentorSemesterId: null,
    profileComplete: true,
    roleSetupComplete: true,
    readNotificationKeys: ["session-session-1-confirmed"],
    sessions: [{ id: "session-1", semesterId: "fall", mentorSemesterId: "mentor-a", startupSemesterId: "startup-me", partnerName: "Maya Chen", meetingDate: "2026-09-11", startsAt: "15:30", endsAt: "16:15", topic: "Pricing", format: "Online", status: "confirmed" }],
    network: [],
  });

  assert.deepEqual(dashboard.notifications.map((notice) => [notice.key, notice.read]), [
    ["session-session-1-confirmed", true],
  ]);
  assert.equal(unreadNotificationCount(dashboard), 0);
});

test("safe profile payloads never include role, membership, or sign-in email", () => {
  assert.deepEqual(buildProfileUpdate("mentor", {
    fullName: " Maya Chen ",
    headline: " VP Revenue ",
    summary: " Helps founders grow. ",
    tags: "Sales, Growth, sales",
    websiteUrl: " https://example.com ",
    linkedinUrl: " linkedin.com/in/maya ",
  }), {
    profile: { full_name: "Maya Chen" },
    mentorProfile: {
      title: "VP Revenue",
      biography: "Helps founders grow.",
      expertise_tags: ["Sales", "Growth"],
      website_url: "https://example.com",
      linkedin_url: "linkedin.com/in/maya",
    },
  });
});

test("startup profile saves keep matching preferences in the Mentor Needs form", () => {
  assert.deepEqual(buildProfileUpdate("startup", {
    fullName: " Layth Rahman ",
    headline: "Preparing for an enterprise sales mentor",
    summary: "A concise company snapshot.",
    tags: "Finance, Sales",
    websiteUrl: "",
    linkedinUrl: "",
  }), {
    profile: { full_name: "Layth Rahman" },
    startupSemester: {
      company_snapshot: "A concise company snapshot.",
      mentor_need_context: "Preparing for an enterprise sales mentor",
    },
  });
});
