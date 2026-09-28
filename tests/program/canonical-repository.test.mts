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

type RecordedResponse = {
  body: unknown;
  status: number;
};

function recordedResponse(status: number, body: unknown): RecordedResponse {
  return { body, status };
}

function isRecordedResponse(value: unknown): value is RecordedResponse {
  return typeof value === "object" && value !== null && "body" in value && "status" in value;
}

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
        const response = responses[responseIndex++] ?? [];
        const body = isRecordedResponse(response) ? response.body : response;
        return new Response(JSON.stringify(body), {
          headers: { "Content-Type": "application/json" },
          status: isRecordedResponse(response) ? response.status : 200,
        });
      },
    },
  });
  return { client, requests };
}

test("mentor directory retries without profiles.photo_path when the deployed schema lacks that column", async () => {
  const mentorRow = {
    id: "mentor-term-legacy-schema",
    semester_id: "semester-1",
    membership: {
      profile_id: "profile-1",
      profile: {
        full_name: "Legacy Schema Mentor",
        is_active: true,
        mentor_profile: { photo_url: "https://images.example/mentor.jpg" },
      },
    },
  };
  const { client, requests } = recordingClient([
    recordedResponse(400, {
      code: "42703",
      details: null,
      hint: null,
      message: "column profiles_1.photo_path does not exist",
    }),
    [mentorRow],
  ]);

  const mentors = await loadMentorDirectory(client);

  assert.equal(mentors[0].photo_url, "https://images.example/mentor.jpg");
  assert.equal(requests.length, 2);
  assert.match(requests[0].url.searchParams.get("select") ?? "", /photo_path/u);
  assert.doesNotMatch(requests[1].url.searchParams.get("select") ?? "", /photo_path/u);
});

test("mentor directory resolves personal photos with one authenticated storage batch", async () => {
  const firstProfileId = "11111111-1111-4111-8111-111111111111";
  const secondProfileId = "33333333-3333-4333-8333-333333333333";
  const firstPath = `${firstProfileId}/22222222-2222-4222-8222-222222222222.png`;
  const secondPath = `${secondProfileId}/44444444-4444-4444-8444-444444444444.jpg`;
  const { client, requests } = recordingClient([
    [
      { id: "mentor-term-photo-1", semester_id: "semester-1", membership: {
        profile_id: firstProfileId, profile: { full_name: "First Photo Mentor", is_active: true, photo_path: firstPath },
      } },
      { id: "mentor-term-photo-2", semester_id: "semester-1", membership: {
        profile_id: secondProfileId, profile: { full_name: "Second Photo Mentor", is_active: true, photo_path: secondPath },
      } },
    ],
    [
      { error: null, path: firstPath, signedURL: `/object/sign/profile-photos/${firstPath}?token=first` },
      { error: null, path: secondPath, signedURL: `/object/sign/profile-photos/${secondPath}?token=second` },
    ],
  ]);
  const mentors = await loadMentorDirectory(client);

  assert.equal(mentors.length, 2);
  assert.match(mentors[0].photo_url ?? "", /token=first/u);
  assert.match(mentors[1].photo_url ?? "", /token=second/u);
  assert.match(requests[0].url.searchParams.get("select") ?? "", /photo_path/u);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].url.pathname, "/storage/v1/object/sign/profile-photos");
  assert.deepEqual(JSON.parse(requests[1].body ?? "null"), {
    expiresIn: 3600,
    paths: [firstPath, secondPath],
  });
});

test("mentor profile preserves legacy photo when no personal photo is set", async () => {
  const { client, requests } = recordingClient([{
    id: "mentor-term-legacy", semester_id: "semester-1", membership: {
      profile_id: "profile-1", profile: { full_name: "Legacy Mentor", mentor_profile: { photo_url: "https://images.example/mentor.jpg" } },
    },
  }]);
  const mentor = await loadMentorProfile(client, "mentor-term-legacy");
  assert.equal(mentor?.photo_url, "https://images.example/mentor.jpg");
  assert.equal(requests.length, 1);
});

test("single mentor reads retry without profiles.photo_path on the verified missing-column error", async () => {
  const mentorRow = {
    id: "mentor-term-legacy-schema",
    semester_id: "semester-1",
    membership: {
      profile_id: "profile-1",
      profile: {
        full_name: "Legacy Schema Mentor",
        is_active: true,
        mentor_profile: { photo_url: "https://images.example/mentor.jpg" },
      },
    },
  };
  const { client, requests } = recordingClient([
    recordedResponse(400, {
      code: "42703",
      details: null,
      hint: null,
      message: "column profiles.photo_path does not exist",
    }),
    mentorRow,
  ]);

  const mentor = await loadMentorProfile(client, mentorRow.id);

  assert.equal(mentor?.photo_url, "https://images.example/mentor.jpg");
  assert.equal(requests.length, 2);
  assert.match(requests[0].url.searchParams.get("select") ?? "", /photo_path/u);
  assert.doesNotMatch(requests[1].url.searchParams.get("select") ?? "", /photo_path/u);
});

test("mentor profile signs its personal photo instead of using the legacy image", async () => {
  const path = "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png";
  const { client } = recordingClient([{
    id: "mentor-term-photo", semester_id: "semester-1", membership: {
      profile_id: path.split("/")[0], profile: { full_name: "Photo Mentor", photo_path: path,
        mentor_profile: { photo_url: "https://images.example/old.jpg" } },
    },
  }, { signedURL: `/object/sign/profile-photos/${path}?token=test` }]);
  const mentor = await loadMentorProfile(client, "mentor-term-photo");
  assert.match(mentor?.photo_url ?? "", /\/storage\/v1\/object\/sign\/profile-photos\//u);
});

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

test("mentor directory omits profiles retained only for anonymized deletion history", async () => {
  const { client, requests } = recordingClient([[{
    id: "active-mentor-term",
    semester_id: "semester-1",
    membership: {
      id: "active-membership",
      profile_id: "active-profile",
      status: "active",
      profile: {
        email: "active@example.com",
        full_name: "Active Mentor",
        is_active: true,
        status: "approved",
      },
    },
  }, {
    id: "deleted-mentor-term",
    semester_id: "semester-1",
    membership: {
      id: "deleted-membership",
      profile_id: "deleted-profile",
      status: "suspended",
      profile: {
        email: "deleted+profile@invalid.example",
        full_name: "Deleted member",
        is_active: false,
        status: "rejected",
      },
    },
  }]]);

  const mentors = await loadMentorDirectory(client);

  assert.deepEqual(mentors.map((mentor) => mentor.id), ["active-mentor-term"]);
  assert.match(requests[0].url.searchParams.get("select") ?? "", /status/u);
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
