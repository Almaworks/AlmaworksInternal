import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../src/db/types.ts";
import {
  CohortRepositoryError,
  loadCohortMembers,
  loadManageableCohorts,
} from "../../src/lifecycle/cohort-repository.ts";

type QueryResult = {
  data: readonly Record<string, unknown>[];
  error: { message: string } | null;
};

type CohortTable = "semester_memberships" | "profiles" | "mentor_semesters" | "startup_team_memberships";

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

function cohortClient(
  errors: Partial<Record<CohortTable, string>> = {},
  overrides: Partial<Record<CohortTable, readonly Record<string, unknown>[]>> = {},
): SupabaseClient<Database> {
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
      { semester_membership_id: "mentor-membership", semester_id: "spring-2026", readiness_status: "ready" },
    ],
    startup_team_memberships: [
      {
        semester_membership_id: "startup-membership",
        semester_id: "spring-2026",
        startup_semester: { semester_id: "spring-2026", readiness_status: "in_progress" },
      },
    ],
    ...overrides,
  };

  return {
    from(table: string) {
      const errorMessage = errors[table as CohortTable];
      return fakeQuery({
        data: rowsByTable[table] ?? [],
        error: errorMessage === undefined ? null : { message: errorMessage },
      });
    },
  } as unknown as SupabaseClient<Database>;
}

const springCohort = [
  { id: "spring-2026", name: "Spring 2026", startsOn: "2026-01-20", isActive: true },
] as const;

type ManageableTable = "profiles" | "platform_roles" | "semester_memberships" | "semesters";

type ManageableResult = {
  data: Record<string, unknown> | readonly Record<string, unknown>[] | null;
  error: { message: string } | null;
};

interface ManageableQuery extends PromiseLike<ManageableResult> {
  select(columns: string): ManageableQuery;
  eq(column: string, value: unknown): ManageableQuery;
  order(column: string, options: { ascending: boolean }): ManageableQuery;
  maybeSingle(): Promise<ManageableResult>;
}

function manageableCohortClient(input: {
  adminSemesterIds?: readonly string[];
  errorTable?: ManageableTable;
  isSuperAdmin?: boolean;
  profileExists?: boolean;
  semesterCount?: number;
}) {
  const semesterCount = input.semesterCount ?? 50;
  const semesters = Array.from({ length: semesterCount }, (_, index) => ({
    id: `semester-${index + 1}`,
    name: `Semester ${index + 1}`,
    start_date: `2026-${String((index % 12) + 1).padStart(2, "0")}-01`,
    is_active: index === 0,
  }));
  const calls: ManageableTable[] = [];
  const filters: { column: string; table: ManageableTable; value: unknown }[] = [];
  let rpcCalls = 0;
  const rows: Record<ManageableTable, ManageableResult["data"]> = {
    profiles: input.profileExists === false ? null : { id: "profile-admin" },
    platform_roles: input.isSuperAdmin ? [{ role: "super_admin" }] : [],
    semester_memberships: (input.adminSemesterIds ?? []).map((semesterId) => ({ semester_id: semesterId })),
    semesters,
  };
  const client = {
    from(table: ManageableTable) {
      calls.push(table);
      const result: ManageableResult = {
        data: rows[table],
        error: input.errorTable === table ? { message: `${table} failed` } : null,
      };
      const query: ManageableQuery = {
        select: () => query,
        eq: (column, value) => {
          filters.push({ column, table, value });
          return query;
        },
        order: () => query,
        maybeSingle: async () => result,
        then: (onfulfilled, onrejected) => Promise.resolve(result).then(onfulfilled, onrejected),
      };
      return query;
    },
    rpc: async () => {
      rpcCalls += 1;
      return { data: false, error: null };
    },
  } as unknown as SupabaseClient<Database>;
  return { client, calls, filters, getRpcCalls: () => rpcCalls };
}

test("manageable cohorts use a fixed number of RLS-visible authority reads", async () => {
  const fake = manageableCohortClient({
    adminSemesterIds: ["semester-2", "semester-40"],
    semesterCount: 50,
  });

  const cohorts = await loadManageableCohorts(fake.client, "auth-user");

  assert.deepEqual(cohorts.map((cohort) => cohort.id), ["semester-2", "semester-40"]);
  assert.deepEqual(fake.calls, ["profiles", "platform_roles", "semester_memberships", "semesters"]);
  assert.equal(fake.getRpcCalls(), 0);
});

test("manageable cohorts reuse a trusted authenticated profile id in three reads", async () => {
  const fake = manageableCohortClient({
    adminSemesterIds: ["semester-2"],
    semesterCount: 2,
  });

  const cohorts = await loadManageableCohorts(fake.client, "auth-user", "profile-admin");

  assert.deepEqual(cohorts.map((cohort) => cohort.id), ["semester-2"]);
  assert.deepEqual(fake.calls, ["platform_roles", "semester_memberships", "semesters"]);
  assert.deepEqual(fake.filters, [
    { column: "profile_id", table: "platform_roles", value: "profile-admin" },
    { column: "role", table: "platform_roles", value: "super_admin" },
    { column: "profile_id", table: "semester_memberships", value: "profile-admin" },
    { column: "role", table: "semester_memberships", value: "admin" },
    { column: "status", table: "semester_memberships", value: "active" },
  ]);
  assert.equal(fake.getRpcCalls(), 0);
});

test("super administrators receive every cohort without per-semester checks", async () => {
  const fake = manageableCohortClient({ isSuperAdmin: true, semesterCount: 12 });

  const cohorts = await loadManageableCohorts(fake.client, "auth-user");

  assert.equal(cohorts.length, 12);
  assert.equal(fake.getRpcCalls(), 0);
});

test("manageable cohort loading denies an unlinked identity and propagates authority read errors", async () => {
  const missingProfile = manageableCohortClient({ profileExists: false });
  assert.deepEqual(await loadManageableCohorts(missingProfile.client, "auth-user"), []);
  assert.deepEqual(missingProfile.calls, ["profiles"]);

  const failedMemberships = manageableCohortClient({ errorTable: "semester_memberships" });
  await assert.rejects(
    loadManageableCohorts(failedMemberships.client, "auth-user"),
    (error: unknown) => error instanceof CohortRepositoryError
      && error.message === "semester_memberships failed",
  );
});

test("cohort members receive mentor, startup, and admin readiness from their semester records", async () => {
  const members = await loadCohortMembers(cohortClient(), springCohort);

  assert.deepEqual(
    members.map((member) => [member.membershipId, member.readinessStatus]),
    [
      ["mentor-membership", "ready"],
      ["startup-membership", "in_progress"],
      ["admin-membership", null],
    ],
  );
});

test("startup readiness is ignored unless membership, team, and startup rows share one semester", async () => {
  const mismatchedRows = [
    {
      semester_membership_id: "startup-membership",
      semester_id: "fall-2025",
      startup_semester: { semester_id: "spring-2026", readiness_status: "ready" },
    },
    {
      semester_membership_id: "startup-membership",
      semester_id: "spring-2026",
      startup_semester: { semester_id: "fall-2025", readiness_status: "ready" },
    },
  ] as const;

  for (const row of mismatchedRows) {
    const members = await loadCohortMembers(
      cohortClient({}, { startup_team_memberships: [row] }),
      springCohort,
    );
    assert.equal(
      members.find((member) => member.membershipId === "startup-membership")?.readinessStatus,
      null,
    );
  }
});

test("conflicting duplicate startup readiness resolves to null independent of response order", async () => {
  const ready = {
    semester_membership_id: "startup-membership",
    semester_id: "spring-2026",
    startup_semester: { semester_id: "spring-2026", readiness_status: "ready" },
  } as const;
  const inProgress = {
    semester_membership_id: "startup-membership",
    semester_id: "spring-2026",
    startup_semester: { semester_id: "spring-2026", readiness_status: "in_progress" },
  } as const;

  for (const rows of [[ready, inProgress], [inProgress, ready]]) {
    const members = await loadCohortMembers(
      cohortClient({}, { startup_team_memberships: rows }),
      springCohort,
    );
    assert.equal(
      members.find((member) => member.membershipId === "startup-membership")?.readinessStatus,
      null,
    );
  }
});

test("cohort loading wraps mentor readiness query failures", async () => {
  await assert.rejects(
    loadCohortMembers(cohortClient({ mentor_semesters: "mentor readiness query failed" }), springCohort),
    (error: unknown) => error instanceof CohortRepositoryError
      && error.message === "mentor readiness query failed",
  );
});

test("cohort loading wraps startup readiness query failures", async () => {
  await assert.rejects(
    loadCohortMembers(cohortClient({ startup_team_memberships: "startup readiness query failed" }), springCohort),
    (error: unknown) => error instanceof CohortRepositoryError
      && error.message === "startup readiness query failed",
  );
});
