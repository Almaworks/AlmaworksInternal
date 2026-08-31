import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import {
  assignFounderMembership,
  createMentorRecords,
  createStartupRecords,
  moveFounderMembership,
  setSemesterMemberAccess,
  updateStartupRecords,
  updateMentorRecords,
} from "../../src/program/server/canonical-admin.ts";

type RequestRecord = { body: string | null; method: string; path: string; url: URL };

type TestResponse = { body: unknown; status: number };

function recordingClient(responses: readonly (unknown | TestResponse)[]) {
  const requests: RequestRecord[] = [];
  let index = 0;
  const client = createClient("https://example.supabase.co", "service-key", {
    global: {
      fetch: async (input, init) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
        requests.push({
          body: typeof init?.body === "string" ? init.body : null,
          method: init?.method ?? "GET",
          path: url.pathname,
          url,
        });
        const configured = responses[index++] ?? [];
        const response = configured && typeof configured === "object" && "status" in configured && "body" in configured
          ? configured as TestResponse
          : { body: configured, status: 200 };
        return new Response(JSON.stringify(response.body), {
          headers: { "Content-Type": "application/json" },
          status: response.status,
        });
      },
    },
  });
  return { client, requests };
}

test("mentor creation owns the membership, durable profile, and semester record on the server", async () => {
  const { client, requests } = recordingClient([
    { id: "membership-1" },
    [],
    { id: "mentor-term-1" },
  ]);

  const mentorSemesterId = await createMentorRecords(client, {
    biography: "Advisor",
    company: "Alma Labs",
    expertiseTags: ["Sales"],
    isActive: true,
    linkedinUrl: null,
    preferredFormat: "online",
    profileId: "profile-1",
    semesterId: "semester-1",
    title: "CEO",
  });

  assert.equal(mentorSemesterId, "mentor-term-1");
  assert.deepEqual(requests.map((request) => request.path), [
    "/rest/v1/semester_memberships",
    "/rest/v1/mentor_profiles",
    "/rest/v1/mentor_semesters",
  ]);
  assert.ok(requests.every((request) => !request.path.endsWith("/mentors")));
});

test("startup creation writes the durable organization before its cohort record", async () => {
  const { client, requests } = recordingClient([
    { id: "organization-1" },
    { id: "startup-term-1" },
  ]);

  const result = await createStartupRecords(client, {
    description: "Builds useful things",
    industry: "Software",
    name: "Canonical Co",
    preferredTags: ["Go-to-market"],
    semesterId: "semester-1",
    slug: "canonical-co",
    stage: "seed",
  });

  assert.deepEqual(result, { organizationId: "organization-1", startupSemesterId: "startup-term-1" });
  assert.deepEqual(requests.map((request) => request.path), [
    "/rest/v1/startup_organizations",
    "/rest/v1/startup_semesters",
  ]);
});

test("mentor updates split identity, biography, term, and activity across canonical owners", async () => {
  const { client, requests } = recordingClient([
    { semester_membership_id: "membership-1", membership: { profile_id: "profile-1" } },
    [],
    [],
    [],
    [],
  ]);

  await updateMentorRecords(client, {
    biography: "Updated biography",
    company: "Updated company",
    email: "mentor@example.com",
    expertiseTags: ["Finance"],
    fullName: "Updated Mentor",
    generalAvailability: "Fridays",
    isActive: false,
    linkedinUrl: null,
    mentorSemesterId: "mentor-term-1",
    openingTalk: null,
    preferredFormat: "online",
    title: "Partner",
  });

  assert.deepEqual(requests.map((request) => request.path), [
    "/rest/v1/mentor_semesters",
    "/rest/v1/profiles",
    "/rest/v1/mentor_profiles",
    "/rest/v1/mentor_semesters",
    "/rest/v1/semester_memberships",
  ]);
});

test("founder assignment creates canonical semester and team memberships", async () => {
  const { client, requests } = recordingClient([
    { semester_id: "semester-1" },
    { id: "membership-1" },
    [],
  ]);

  await assignFounderMembership(client, {
    profileId: "profile-1",
    startupSemesterId: "startup-term-1",
  });

  assert.deepEqual(requests.map((request) => request.path), [
    "/rest/v1/startup_semesters",
    "/rest/v1/semester_memberships",
    "/rest/v1/startup_team_memberships",
  ]);
  assert.equal(requests[2].url.searchParams.get("on_conflict"), "startup_semester_id,semester_membership_id");
});

test("founder move is one atomic canonical command", async () => {
  const { client, requests } = recordingClient([
    { moved_membership_id: "team-1" },
  ]);

  await moveFounderMembership(client, {
    fromStartupSemesterId: "startup-term-1",
    profileId: "profile-1",
    toStartupSemesterId: "startup-term-2",
  });

  assert.deepEqual(requests.map((request) => request.path), [
    "/rest/v1/rpc/move_startup_team_membership",
  ]);
  assert.deepEqual(JSON.parse(requests[0].body ?? "null"), {
    p_from_startup_semester_id: "startup-term-1",
    p_profile_id: "profile-1",
    p_to_startup_semester_id: "startup-term-2",
  });
});

test("founder move failure cannot leave a source membership deleted", async () => {
  const { client, requests } = recordingClient([{
    body: { code: "23505", message: "destination membership conflicts" },
    status: 409,
  }]);

  await assert.rejects(() => moveFounderMembership(client, {
    fromStartupSemesterId: "startup-term-1",
    profileId: "profile-1",
    toStartupSemesterId: "startup-term-2",
  }), /destination membership conflicts/u);

  assert.deepEqual(requests.map((request) => request.path), [
    "/rest/v1/rpc/move_startup_team_membership",
  ]);
});

test("semester role transition is one database command and never mutates platform roles", async () => {
  const { client, requests } = recordingClient([
    "membership-1",
  ]);

  await setSemesterMemberAccess(client, {
    approve: false,
    email: "mentor@example.com",
    fullName: "Mentor Name",
    profileId: "profile-1",
    role: "mentor",
    semesterId: "semester-1",
  });

  assert.deepEqual(requests.map((request) => request.path), ["/rest/v1/rpc/set_semester_member_access"]);
  assert.deepEqual(JSON.parse(requests[0].body ?? "null"), {
    p_approve: false,
    p_email: "mentor@example.com",
    p_full_name: "Mentor Name",
    p_profile_id: "profile-1",
    p_role: "mentor",
    p_semester_id: "semester-1",
  });
  assert.ok(requests.every((request) => request.path !== "/rest/v1/platform_roles"));
});

test("semester role command reports an authorization failure without fallback writes", async () => {
  const { client, requests } = recordingClient([{
    body: { code: "42501", message: "Semester administrator access required" },
    status: 403,
  }]);

  await assert.rejects(() => setSemesterMemberAccess(client, {
    approve: true,
    email: null,
    fullName: null,
    profileId: "profile-1",
    role: "admin",
    semesterId: "semester-1",
  }), /Semester administrator access required/u);
  assert.deepEqual(requests.map((request) => request.path), ["/rest/v1/rpc/set_semester_member_access"]);
});

test("startup updates are one server-owned atomic command", async () => {
  const { client, requests } = recordingClient([{ startup_semester_id: "startup-term-1" }]);

  await updateStartupRecords(client, {
    description: "Updated",
    industry: "Software",
    name: "Canonical Co",
    preferredTags: ["Sales"],
    mentorshipNeeds: ["Growth"],
    slug: "canonical-co",
    stage: "seed",
    startupSemesterId: "startup-term-1",
  });

  assert.deepEqual(requests.map((request) => request.path), ["/rest/v1/rpc/update_startup_records"]);
  assert.deepEqual(JSON.parse(requests[0].body ?? "null"), {
    p_description: "Updated",
    p_industry: "Software",
    p_mentorship_needs: ["Growth"],
    p_name: "Canonical Co",
    p_preferred_expertise_tags: ["Sales"],
    p_slug: "canonical-co",
    p_stage: "seed",
    p_startup_semester_id: "startup-term-1",
  });
});
