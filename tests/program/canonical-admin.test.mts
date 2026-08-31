import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import {
  assignFounderMembership,
  createMentorRecords,
  createStartupRecords,
  moveFounderMembership,
  updateMentorRecords,
} from "../../src/program/server/canonical-admin.ts";

type RequestRecord = { body: string | null; method: string; path: string };

function recordingClient(responses: readonly unknown[]) {
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
        });
        return new Response(JSON.stringify(responses[index++] ?? []), {
          headers: { "Content-Type": "application/json" },
          status: 200,
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
});

test("founder move targets membership rows and never rewrites founder JSON", async () => {
  const { client, requests } = recordingClient([
    { semester_id: "semester-1" },
    { semester_id: "semester-1" },
    { id: "membership-1" },
    [],
    [],
  ]);

  await moveFounderMembership(client, {
    fromStartupSemesterId: "startup-term-1",
    profileId: "profile-1",
    toStartupSemesterId: "startup-term-2",
  });

  assert.deepEqual(requests.map((request) => request.path), [
    "/rest/v1/startup_semesters",
    "/rest/v1/startup_semesters",
    "/rest/v1/semester_memberships",
    "/rest/v1/startup_team_memberships",
    "/rest/v1/startup_team_memberships",
  ]);
  assert.ok(requests.every((request) => !request.path.endsWith("/startups")));
});
