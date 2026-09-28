import assert from "node:assert/strict";
import test from "node:test";
import { buildStartupDirectory, filterStartupDirectory } from "../../src/dashboard/participant-startups.ts";
import { buildParticipantPreview } from "../../src/dashboard/participant-preview.ts";

const company = { id: "company", semesterId: "fall", name: "Acme", industry: "Health", stage: "Seed", description: "Care navigation", websiteUrl: "acme.example", goals: ["Pilot"], mentorshipNeeds: ["Sales"], mentorNeedContext: "Enterprise buyers" };
const members = [
  { id: "member-a", semesterId: "fall", profileId: "a", role: "startup" as const, status: "active" as const },
  { id: "member-b", semesterId: "fall", profileId: "b", role: "startup" as const, status: "active" as const },
  { id: "member-c", semesterId: "fall", profileId: "c", role: "startup" as const, status: "suspended" as const },
  { id: "old", semesterId: "spring", profileId: "d", role: "startup" as const, status: "active" as const },
];
const people = members.map((member) => ({ id: member.profileId, full_name: member.profileId === "b" ? "Bea" : member.profileId, email: `${member.profileId}@example.com`, photoUrl: null }));
const teams = members.map((member) => ({ startup_semester_id: "company", semester_membership_id: member.id }));

test("startup directory groups active people by startup and excludes other cohorts and suspended members", () => {
  const result = buildStartupDirectory("fall", [company, { ...company, id: "empty", name: "Empty" }, { ...company, id: "old", semesterId: "spring" }], members, [...teams, teams[0]], people);
  assert.deepEqual(result.map((startup) => startup.id), ["company", "empty"]);
  assert.deepEqual(result[0].people.map((person) => person.id), ["a", "b"]);
  assert.equal(result[0].people[1].email, "b@example.com");
  assert.deepEqual(result[1].people, []);
  assert.equal(result[0].description, "Care navigation");
});

test("startup search includes company details, needs, and associated people", () => {
  const entries = buildStartupDirectory("fall", [company], members, teams, people);
  for (const query of [" ACME ", "health", "sales", "Bea", "b@example.com", "enterprise"]) {
    assert.equal(filterStartupDirectory(entries, query).length, 1, query);
  }
  assert.equal(filterStartupDirectory(entries, "unknown").length, 0);
  assert.equal(filterStartupDirectory(entries, "").length, 1);
});

test("mentor preview has grouped startup profiles; startup persona does not receive the module data", () => {
  const mentor = buildParticipantPreview("mentor");
  assert.ok(mentor.startups.length > 0);
  assert.ok(mentor.startups.some((startup) => startup.people.length > 1));
  assert.deepEqual(buildParticipantPreview("startup").startups, []);
});
