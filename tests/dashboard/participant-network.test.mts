import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { scopeParticipantDashboard } from "../../src/dashboard/participant-dashboard.ts";
import { scopeActiveNetwork } from "../../src/dashboard/participant-network.ts";

test("dashboard network loads active cohort memberships before looking up mentor profiles", () => {
  const route = readFileSync(new URL("../../src/dashboard/participant-snapshot-loader.ts", import.meta.url), "utf8");
  assert.match(route, /const networkMembershipsPromise[\s\S]*?\.eq\("semester_id", activeSemester.id\)[\s\S]*?\.eq\("status", "active"\)/);
  assert.match(route, /from\("mentor_profiles"\)\.select\([^\n]+\)\.in\("profile_id", mentorProfileIds\)/);
  assert.match(route, /from\("profiles"\)\.select\("id,full_name,email,photo_path"\)\.in\("id", networkProfileIds\)/);
  assert.match(route, /base\.network = scopeActiveNetwork\([\s\S]*?activeSemester\.id,[\s\S]*?profileId,[\s\S]*?networkData\.networkMemberships,/);
});

test("startup network headlines format canonical stage values for display", () => {
  const route = readFileSync(new URL("../../src/dashboard/participant-snapshot-loader.ts", import.meta.url), "utf8");

  assert.match(route, /import \{ formatEnumLabel \} from "\.\.\/presentation\/display-labels\.ts";/u);
  assert.match(route, /\[organization\?\.name, organization\?\.industry, startup\?\.stage && formatEnumLabel\(startup\.stage\)\]\.filter\(Boolean\)\.join/u);
});

test("network rejects historical, inactive and wrong-role profiles and preserves contact info", () => {
  const memberships = [
    { id: "m1", profileId: "active", semesterId: "fall", role: "mentor" as const, status: "active" as const },
    { id: "m2", profileId: "alumni", semesterId: "fall", role: "mentor" as const, status: "alumni" as const },
    { id: "m3", profileId: "old", semesterId: "spring", role: "mentor" as const, status: "active" as const },
    { id: "m4", profileId: "peer", semesterId: "fall", role: "startup" as const, status: "active" as const },
    { id: "m5", profileId: "pending", semesterId: "fall", role: "mentor" as const, status: "onboarding" as const },
    { id: "m6", profileId: "suspended", semesterId: "fall", role: "mentor" as const, status: "suspended" as const },
  ];
  const entries = memberships.map((member) => ({ id: member.profileId, semesterId: "fall", kind: member.role, name: member.profileId, headline: "", summary: "", tags: [], websiteUrl: null, photoUrl: null, email: `${member.profileId}@example.com`, linkedinUrl: "https://linkedin.com/in/example" }));
  entries.push({ ...entries[0], id: "peer" });
  const result = scopeActiveNetwork("fall", "self", memberships, entries);
  assert.deepEqual(result.map((entry) => entry.id), ["active", "peer"]);
  assert.equal(result[0].email, "active@example.com");
  assert.equal(result[0].linkedinUrl, "https://linkedin.com/in/example");
  assert.deepEqual(scopeActiveNetwork("fall", "active", memberships, entries).map((entry) => entry.id), ["peer"]);
});

test("startup networks include cohort peers as well as mentors, excluding other cohorts", () => {
  const network = [
    { id: "mentor", semesterId: "fall", kind: "mentor" as const },
    { id: "peer", semesterId: "fall", kind: "startup" as const },
    { id: "old", semesterId: "spring", kind: "mentor" as const },
  ].map((entry) => ({ ...entry, name: entry.id, headline: "", summary: "", tags: [] }));
  const result = scopeParticipantDashboard({ role: "startup", profileId: "self", startupSemesterId: "team", activeSemesterId: "fall", source: { network, notifications: [] } });
  assert.deepEqual(result.network.map((entry) => entry.id), ["mentor", "peer"]);
});
