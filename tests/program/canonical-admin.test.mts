import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import {
  AmbiguousDatabaseOutcomeError,
  authorizeSemesterMemberIdentityUpdate,
  assignFounderMembership,
  createMentorRecords,
  createStartupRecords,
  KnownDatabaseRejectionError,
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
        if (configured instanceof Error) throw configured;
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
    "mentor-term-1",
  ]);

  const mentorSemesterId = await createMentorRecords(client, {
    actorProfileId: "admin-1",
    biography: "Advisor",
    company: "Alma Labs",
    expertiseTags: ["Sales"],
    email: "mentor@example.com",
    isActive: true,
    linkedinUrl: null,
    preferredFormat: "online",
    profileId: "profile-1",
    semesterId: "semester-1",
    title: "CEO",
  });

  assert.equal(mentorSemesterId, "mentor-term-1");
  assert.deepEqual(requests.map((request) => request.path), ["/rest/v1/rpc/create_mentor_records"]);
  assert.deepEqual(JSON.parse(requests[0].body ?? "null"), {
    p_actor_profile_id: "admin-1",
    p_biography: "Advisor",
    p_company: "Alma Labs",
    p_email: "mentor@example.com",
    p_expertise_tags: ["Sales"],
    p_general_availability: null,
    p_is_active: true,
    p_linkedin_url: null,
    p_opening_talk: null,
    p_preferred_format: "online",
    p_profile_id: "profile-1",
    p_semester_id: "semester-1",
    p_title: "CEO",
  });
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
    "mentor-term-1",
  ]);

  await updateMentorRecords(client, {
    actorProfileId: "admin-1",
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

  assert.deepEqual(requests.map((request) => request.path), ["/rest/v1/rpc/update_mentor_records"]);
  assert.deepEqual(JSON.parse(requests[0].body ?? "null"), {
    p_actor_profile_id: "admin-1",
    p_mentor_semester_id: "mentor-term-1",
    p_patch: {
      biography: "Updated biography",
      company: "Updated company",
      email: "mentor@example.com",
      expertise_tags: ["Finance"],
      full_name: "Updated Mentor",
      general_availability: "Fridays",
      is_active: false,
      linkedin_url: null,
      opening_talk: null,
      preferred_format: "online",
      title: "Partner",
    },
  });
});

test("member identity preflight verifies the exact target before Auth mutation", async () => {
  const { client, requests } = recordingClient(["membership-1"]);
  const result = await authorizeSemesterMemberIdentityUpdate(client, {
    profileId: "profile-1",
    semesterId: "semester-1",
  });
  assert.equal(result, "membership-1");
  assert.deepEqual(requests.map((request) => request.path), ["/rest/v1/rpc/authorize_semester_member_identity_update"]);
  assert.deepEqual(JSON.parse(requests[0].body ?? "null"), {
    p_profile_id: "profile-1",
    p_semester_id: "semester-1",
  });
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

test("founder assignment reactivates an existing membership without updating identity keys", async () => {
  const { client, requests } = recordingClient([
    { semester_id: "semester-1" },
    { body: null, status: 200 },
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
    "/rest/v1/semester_memberships",
    "/rest/v1/startup_team_memberships",
  ]);
  assert.equal(requests[2].method, "PATCH");
  assert.deepEqual(JSON.parse(requests[2].body ?? "null"), { status: "active" });
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
    actorProfileId: "admin-1",
    approve: false,
    email: "mentor@example.com",
    fullName: "Mentor Name",
    profileId: "profile-1",
    role: "mentor",
    semesterId: "semester-1",
  });

  assert.deepEqual(requests.map((request) => request.path), ["/rest/v1/rpc/set_semester_member_access"]);
  assert.deepEqual(JSON.parse(requests[0].body ?? "null"), {
    p_actor_profile_id: "admin-1",
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
    actorProfileId: "admin-1",
    approve: true,
    email: null,
    fullName: null,
    profileId: "profile-1",
    role: "admin",
    semesterId: "semester-1",
  }), (error: unknown) => error instanceof KnownDatabaseRejectionError
    && /Semester administrator access required/u.test(error.message));
  assert.deepEqual(requests.map((request) => request.path), ["/rest/v1/rpc/set_semester_member_access"]);
});

test("unknown RPC transport outcome is marked ambiguous instead of rejected", async () => {
  const { client } = recordingClient([new TypeError("connection reset")]);
  await assert.rejects(() => setSemesterMemberAccess(client, {
    actorProfileId: "admin-1",
    approve: false,
    email: "member@example.com",
    fullName: "Member",
    profileId: "profile-1",
    role: "mentor",
    semesterId: "semester-1",
  }), (error: unknown) => error instanceof AmbiguousDatabaseOutcomeError
    && /connection reset/u.test(error.message));
});

test("startup updates are one server-owned atomic command", async () => {
  const { client, requests } = recordingClient([{ startup_semester_id: "startup-term-1" }]);

  await updateStartupRecords(client, {
    description: "Updated",
    industry: "Software",
    name: "Canonical Co",
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
    p_preferred_expertise_tags: [],
    p_slug: "canonical-co",
    p_stage: "seed",
    p_startup_semester_id: "startup-term-1",
  });
});
