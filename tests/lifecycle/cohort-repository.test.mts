import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../src/db/types.ts";
import { loadCohortMembers } from "../../src/lifecycle/cohort-repository.ts";

type QueryResult = {
  data: readonly Record<string, unknown>[];
  error: null;
};

interface FakeQuery extends PromiseLike<QueryResult> {
  select(columns: string): FakeQuery;
  in(column: string, values: readonly string[]): FakeQuery;
  order(column: string, options: { ascending: boolean }): FakeQuery;
}

function fakeQuery(result: QueryResult): FakeQuery {
  const query: FakeQuery = {
    select: () => query,
    in: () => query,
    order: () => query,
    then: (onfulfilled, onrejected) => Promise.resolve(result).then(onfulfilled, onrejected),
  };
  return query;
}

function cohortClient(): SupabaseClient<Database> {
  const rowsByTable: Record<string, readonly Record<string, unknown>[]> = {
    semester_memberships: [
      { id: "mentor-membership", semester_id: "spring-2026", profile_id: "mentor-profile", role: "mentor", status: "onboarding" },
      { id: "startup-membership", semester_id: "spring-2026", profile_id: "startup-profile", role: "startup", status: "onboarding" },
      { id: "admin-membership", semester_id: "spring-2026", profile_id: "admin-profile", role: "admin", status: "active" },
    ],
    profiles: [
      { id: "mentor-profile", full_name: "Mina Mentor", email: "mina@example.com" },
      { id: "startup-profile", full_name: "Sam Startup", email: "sam@example.com" },
      { id: "admin-profile", full_name: "Ari Admin", email: "ari@example.com" },
    ],
    mentor_semesters: [
      { semester_membership_id: "mentor-membership", readiness_status: "ready" },
    ],
    startup_team_memberships: [
      {
        semester_membership_id: "startup-membership",
        startup_semester: { readiness_status: "in_progress" },
      },
    ],
  };

  return {
    from(table: string) {
      return fakeQuery({ data: rowsByTable[table] ?? [], error: null });
    },
  } as unknown as SupabaseClient<Database>;
}

test("cohort members receive mentor, startup, and admin readiness from their semester records", async () => {
  const members = await loadCohortMembers(cohortClient(), [
    { id: "spring-2026", name: "Spring 2026", startsOn: "2026-01-20", isActive: true },
  ]);

  assert.deepEqual(
    members.map((member) => [member.membershipId, member.readinessStatus]),
    [
      ["mentor-membership", "ready"],
      ["startup-membership", "in_progress"],
      ["admin-membership", null],
    ],
  );
});
