import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import {
  createSessionRequest,
  loadFounderHistory,
  loadMentorAvailability,
  loadMentorDirectory,
  loadMentorInbox,
  loadMentorProfile,
  loadMentorSessions,
  loadStartupDirectory,
  loadStartupProfile,
} from "../../src/program/canonical-repository.ts";

type CapturedRequest = {
  body: string | null;
  method: string;
  url: URL;
};

function recordingClient(responses: readonly unknown[] = []) {
  const requests: CapturedRequest[] = [];
  let responseIndex = 0;
  const client = createClient("https://example.supabase.co", "test-key", {
    global: {
      fetch: async (input, init) => {
        requests.push({
          body: typeof init?.body === "string" ? init.body : null,
          method: init?.method ?? "GET",
          url: new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url),
        });
        const body = responses[responseIndex++] ?? [];
        return new Response(JSON.stringify(body), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
    },
  });
  return { client, requests };
}

test("mentor directory is read from canonical term, membership, identity, and biography tables", async () => {
  const { client, requests } = recordingClient();

  await loadMentorDirectory(client);

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.pathname, "/rest/v1/mentor_semesters");
  const select = requests[0].url.searchParams.get("select") ?? "";
  assert.match(select, /semester_memberships/u);
  assert.match(select, /profiles/u);
  assert.match(select, /mentor_profiles/u);
  assert.doesNotMatch(select, /(^|\W)mentors($|\W)/u);
  assert.equal(requests[0].url.searchParams.get("membership.role"), "eq.mentor");
  assert.equal(requests[0].url.searchParams.get("membership.profile.order"), "full_name.asc");
  assert.equal(requests[0].url.searchParams.get("semester_memberships.role"), null);
});

test("startup directory is read from canonical cohort, organization, and team membership tables", async () => {
  const { client, requests } = recordingClient();

  await loadStartupDirectory(client);

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.pathname, "/rest/v1/startup_semesters");
  const select = requests[0].url.searchParams.get("select") ?? "";
  assert.match(select, /startup_organizations/u);
  assert.match(select, /startup_team_memberships/u);
  assert.match(select, /semester_memberships/u);
  assert.match(select, /profiles/u);
  assert.equal(requests[0].url.searchParams.get("organization.order"), "name.asc");
  assert.equal(requests[0].url.searchParams.get("startup_organizations.order"), null);
});

test("mentor profile maps canonical identity, biography, and semester participation into the existing UI contract", async () => {
  const { client, requests } = recordingClient([[{
    id: "mentor-term-1",
    semester_id: "semester-1",
    general_availability: "Friday afternoons",
    membership: {
      id: "membership-1",
      profile_id: "profile-1",
      status: "active",
      profile: {
        email: "mentor@example.com",
        full_name: "Ada Mentor",
        is_active: true,
        mentor_profile: {
          biography: "Operator and advisor",
          company: "Alma Labs",
          expertise_tags: ["Sales"],
          linkedin_url: "https://linkedin.example/ada",
          photo_url: null,
          title: "CEO",
          website_url: null,
        },
      },
    },
    opening_talk: null,
    per_week_availability: {},
    preferred_format: "online",
    readiness_status: "ready",
    semester: { name: "Fall 2026" },
  }]]);

  const mentor = await loadMentorProfile(client, "mentor-term-1");

  assert.deepEqual(mentor, {
    bio: "Operator and advisor",
    company: "Alma Labs",
    email: "mentor@example.com",
    expertise_tags: ["Sales"],
    full_name: "Ada Mentor",
    general_availability: "Friday afternoons",
    id: "mentor-term-1",
    is_active: true,
    linkedin_url: "https://linkedin.example/ada",
    opening_talk: null,
    per_week_availability: {},
    photo_url: null,
    preferred_format: "online",
    profile_id: "profile-1",
    profile_active: true,
    membership_id: "membership-1",
    role_title: "CEO",
    membership_status: "active",
    readiness_status: "ready",
    semester_id: "semester-1",
    semester_name: "Fall 2026",
    slug: "ada-mentor-mentor-t",
    website_url: null,
  });
  assert.equal(requests[0].url.searchParams.get("membership.role"), "eq.mentor");
});

test("startup profile derives founders from canonical team memberships instead of durable legacy JSON", async () => {
  const { client } = recordingClient([[{
    goals: ["Launch"],
    id: "startup-term-1",
    mentorship_needs: ["Fundraising"],
    organization: {
      description: "Builds useful things",
      durable_contact_data: { founders: [{ name: "Stale Founder" }] },
      id: "organization-1",
      industry: "Software",
      logo_url: null,
      name: "Canonical Co",
      slug: "canonical-co",
      website_url: "https://canonical.example",
    },
    readiness_status: "ready",
    semester: { name: "Fall 2026" },
    semester_id: "semester-1",
    stage: "seed",
    team: [{
      is_primary_contact: true,
      semester_id: "semester-1",
      membership: {
        profile_id: "profile-1",
        semester_id: "semester-1",
        profile: { email: "founder@example.com", full_name: "Fresh Founder", is_active: true },
      },
    }],
  }]]);

  const startup = await loadStartupProfile(client, "startup-term-1");

  assert.equal(startup?.name, "Canonical Co");
  assert.deepEqual(startup?.founders, [{ email: "founder@example.com", name: "Fresh Founder", profile_id: "profile-1" }]);
  assert.equal(startup?.website, "https://canonical.example");
});

test("mentor availability resolves the semester membership before reading canonical slot rows", async () => {
  const { client, requests } = recordingClient([[{ id: "membership-1" }], []]);

  await loadMentorAvailability(client, "profile-1", "semester-1");

  assert.deepEqual(requests.map((request) => request.url.pathname), [
    "/rest/v1/semester_memberships",
    "/rest/v1/meeting_availability",
  ]);
  assert.equal(requests[0].url.searchParams.get("profile_id"), "eq.profile-1");
  assert.equal(requests[0].url.searchParams.get("semester_id"), "eq.semester-1");
  assert.equal(requests[1].url.searchParams.get("semester_membership_id"), "eq.membership-1");
  assert.match(requests[1].url.searchParams.get("select") ?? "", /meetings/u);
  assert.equal(requests[1].url.searchParams.get("meeting.order"), "meeting_date.asc");
  assert.equal(requests[1].url.searchParams.get("order"), "slot.asc");
});

test("mentor inbox filters sessions by canonical mentor-semester identity and embeds meeting and startup organization", async () => {
  const { client, requests } = recordingClient([[{ id: "mentor-term-1" }], []]);

  await loadMentorInbox(client, "profile-1");

  assert.deepEqual(requests.map((request) => request.url.pathname), [
    "/rest/v1/mentor_semesters",
    "/rest/v1/sessions",
  ]);
  assert.equal(requests[0].url.searchParams.get("membership.profile_id"), "eq.profile-1");
  assert.equal(requests[0].url.searchParams.get("membership.status"), "eq.active");
  assert.equal(requests[1].url.searchParams.get("mentor_semester_id"), "eq.mentor-term-1");
  assert.equal(requests[1].url.searchParams.get("status"), "eq.requested");
  const select = requests[1].url.searchParams.get("select") ?? "";
  assert.match(select, /meetings/u);
  assert.match(select, /startup_semesters/u);
  assert.match(select, /startup_organizations/u);
  assert.equal(requests[1].url.searchParams.get("meeting.order"), "meeting_date.asc");
});

test("mentor schedule uses its meeting alias for semester filtering and chronological ordering", async () => {
  const { client, requests } = recordingClient([[]]);

  await loadMentorSessions(client, "mentor-term-1", "semester-1");

  assert.equal(requests[0].url.pathname, "/rest/v1/sessions");
  assert.equal(requests[0].url.searchParams.get("mentor_semester_id"), "eq.mentor-term-1");
  assert.equal(requests[0].url.searchParams.get("meeting.semester_id"), "eq.semester-1");
  assert.equal(requests[0].url.searchParams.get("meeting.order"), "meeting_date.asc");
  assert.equal(requests[0].url.searchParams.get("meetings.semester_id"), null);
});

test("session requests write only canonical foreign keys and slot state", async () => {
  const { client, requests } = recordingClient([[]]);

  await createSessionRequest(client, {
    format: "online",
    meetingId: "meeting-1",
    mentorSemesterId: "mentor-term-1",
    semesterId: "semester-1",
    slot: 2,
    startupSemesterId: "startup-term-1",
    topic: "Fundraising",
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.pathname, "/rest/v1/sessions");
  assert.equal(requests[0].method, "POST");
  assert.deepEqual(JSON.parse(requests[0].body ?? "null"), {
    format: "online",
    meeting_id: "meeting-1",
    mentor_semester_id: "mentor-term-1",
    semester_id: "semester-1",
    slot: 2,
    startup_semester_id: "startup-term-1",
    status: "requested",
    topic: "Fundraising",
  });
});

test("founder history aggregates every startup semester and orders the active cohort first", async () => {
  const { client, requests } = recordingClient([
    { email: "founder@example.com", full_name: "Founder" },
    [{ id: "membership-old" }, { id: "membership-active" }],
    [
      { startup_semester_id: "startup-old", startup: { organization: { name: "Old Co" }, semester: { is_active: false, name: "Spring 2026" } } },
      { startup_semester_id: "startup-active", startup: { organization: { name: "Current Co" }, semester: { is_active: true, name: "Fall 2026" } } },
    ],
    [],
  ]);

  const history = await loadFounderHistory(client, "profile-1");

  assert.deepEqual(history?.participations.map((item) => item.startupSemesterId), ["startup-active", "startup-old"]);
  assert.equal(requests[2].url.searchParams.get("semester_membership_id"), "in.(membership-old,membership-active)");
  assert.equal(requests[3].url.searchParams.get("startup_semester_id"), "in.(startup-active,startup-old)");
  assert.equal(requests[3].url.searchParams.get("meeting.order"), "meeting_date.asc");
});
