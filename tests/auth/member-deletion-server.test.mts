import assert from "node:assert/strict";
import test from "node:test";

import { parseMemberDeletionBody } from "../../src/auth/member-deletion.ts";
import {
  deleteMemberPersonalData,
  MemberDeletionError,
  previewMemberDeletion,
  type MemberDeletionClient,
} from "../../src/auth/member-deletion-server.ts";

const profileId = "b2000000-0000-0000-0000-000000000003";
const ready = {
  profile_id: profileId, full_name: "Example Mentor", email: "mentor@example.test",
  version: "revision-1", status: "ready" as const,
  counts: { semesters: 2, memberships: 2, startupTeams: 0, mentorMeetings: 2,
    upcomingMentorMeetings: 0, startupBookings: 0, profileFiles: 1, historicalSessions: 1 },
  blockers: [] as string[],
  impact: { semesters: ["Fall 2025", "Spring 2026"], sharedStartups: [], upcomingMentorMeetings: [] },
};
const prepared = { profile_id: profileId, status: "in_progress" as const,
  auth_user_id: "b2000000-0000-0000-0000-000000000103", operation_id: "operation-1" };

function client(overrides: Partial<MemberDeletionClient> = {}): MemberDeletionClient {
  return {
    preview: async () => ({ data: [ready], error: null }),
    prepare: async () => ({ data: [prepared], error: null }),
    listPersonalFiles: async () => ({ paths: [`${profileId}/photo.png`], error: null }),
    removePersonalFiles: async () => ({ error: null }),
    deleteAuthUser: async () => ({ error: null }),
    finalize: async () => ({ data: [{ profile_id: profileId, status: "completed" }], error: null }),
    ...overrides,
  };
}

test("strict typed confirmation and bounded reason", () => {
  assert.deepEqual(parseMemberDeletionBody({ confirmation: "DELETE", confirmationEmail: " mentor@example.test ", reason: " Program request ", version: "revision-1" }), {
    confirmation: "DELETE", confirmationEmail: "mentor@example.test", reason: "Program request", version: "revision-1",
  });
  for (const value of [
    { confirmation: "delete", confirmationEmail: "mentor@example.test", reason: "Reason", version: "revision-1" },
    { confirmation: "DELETE", confirmationEmail: "other@example.test", reason: " ", version: "revision-1" },
    { confirmation: "DELETE", confirmationEmail: "mentor@example.test", reason: "A valid reason", version: "" },
  ]) assert.throws(() => parseMemberDeletionBody(value));
});

test("preview excludes internal Auth and operation identifiers", async () => {
  assert.deepEqual(await previewMemberDeletion(client(), profileId), {
    profileId, fullName: ready.full_name, email: ready.email, version: ready.version,
    status: "ready", counts: ready.counts, blockers: [], impact: ready.impact,
  });
});

test("preparation uses revision and email, then removes files, Auth, and finalizes", async () => {
  const events: string[] = [];
  const result = await deleteMemberPersonalData(client({
    prepare: async (args) => { events.push(`prepare:${args.p_version}:${args.p_confirmation_email}`); return { data: [prepared], error: null }; },
    listPersonalFiles: async (id) => { events.push(`list:${id}`); return { paths: [], error: null }; },
    deleteAuthUser: async (id, soft) => { events.push(`auth:${id}:${soft}`); return { error: null }; },
    finalize: async (args) => { events.push(`finalize:${args.p_operation_id}`); return { data: [{ profile_id: profileId, status: "completed" }], error: null }; },
  }), { profileId, confirmationEmail: ready.email, reason: "Member request", version: ready.version });
  assert.deepEqual(events, ["prepare:revision-1:mentor@example.test", `list:${profileId}`, `list:${profileId}`, `auth:${prepared.auth_user_id}:false`, "finalize:operation-1"]);
  assert.deepEqual(result, { profileId, status: "completed" });
});

test("failed preparation does not touch external resources", async () => {
  let touched = false;
  await assert.rejects(deleteMemberPersonalData(client({
    prepare: async () => ({ data: null, error: { code: "40001", message: "Preview changed" } }),
    listPersonalFiles: async () => { touched = true; return { paths: [], error: null }; },
  }), { profileId, confirmationEmail: ready.email, reason: "Member request", version: ready.version }),
  (error: unknown) => error instanceof MemberDeletionError && error.code === "40001");
  assert.equal(touched, false);
});

test("Storage and Auth failures never finalize and retain recoverable operation", async () => {
  for (const override of [
    { listPersonalFiles: async () => ({ paths: [], error: { message: "Storage unavailable" } }) },
    { deleteAuthUser: async () => ({ error: { message: "Auth unavailable" } }) },
  ] satisfies Partial<MemberDeletionClient>[]) {
    let finalized = false;
    await assert.rejects(deleteMemberPersonalData(client({
      ...override,
      finalize: async () => { finalized = true; return { data: null, error: null }; },
    }), { profileId, confirmationEmail: ready.email, reason: "Member request", version: ready.version }),
    (error: unknown) => error instanceof MemberDeletionError && error.reconciliationRequired);
    assert.equal(finalized, false);
  }
});

test("completed preparation bypasses repeat external deletion and refresh", async () => {
  const result = await deleteMemberPersonalData(client({
    prepare: async () => ({ data: [{ ...prepared, auth_user_id: null, status: "completed" }], error: null }),
    listPersonalFiles: async () => { throw new Error("must not list"); },
    finalize: async () => { throw new Error("must not finalize"); },
  }), { profileId, confirmationEmail: ready.email, reason: "Member request", version: ready.version });
  assert.deepEqual(result, { profileId, status: "completed" });
});
