import assert from "node:assert/strict";
import test from "node:test";

import { createSupabaseStartupLogoRepository, StartupLogoUnavailableError } from "../../src/startup-logos/supabase-repository.ts";

type Table = "semesters" | "semester_memberships" | "startup_team_memberships" | "startup_semesters" | "startup_organizations";
type Row = Record<string, unknown>;
type Fixture = Partial<Record<Table, Row[]>>;

function client(fixture: Fixture, options: { missingLogoColumn?: boolean } = {}) {
  const queried: Array<{ table: Table; filters: Array<[string, unknown]> }> = [];
  const fake = {
    from(table: Table) {
      const filters: Array<[string, unknown]> = [];
      let missingColumn = false;
      queried.push({ table, filters });
      const chain = {
        select(selection: string) {
          if (table === "startup_organizations" && selection.includes("logo_path") && options.missingLogoColumn) {
            missingColumn = true;
          }
          return chain;
        },
        eq(column: string, value: unknown) { filters.push([column, value]); return chain; },
        in(column: string, value: unknown) { filters.push([column, value]); return chain; },
        limit() { return chain; },
        maybeSingle: async () => missingColumn
          ? { data: null, error: { code: "42703", message: "missing logo_path" } }
          : { data: (fixture[table] ?? [])[0] ?? null, error: null },
        then(resolve: (result: { data: Row[]; error: null }) => void) {
          resolve({ data: fixture[table] ?? [], error: null });
        },
      };
      return chain;
    },
  };
  return { fake: fake as unknown as Parameters<typeof createSupabaseStartupLogoRepository>[0], queried };
}

const fixture: Fixture = {
  semesters: [{ id: "semester-1" }],
  semester_memberships: [{ id: "membership-1" }],
  startup_team_memberships: [{ startup_semester_id: "startup-1" }],
  startup_semesters: [{ startup_organization_id: "organization-1" }],
  startup_organizations: [{ id: "organization-1", name: "Example", logo_path: null, logo_url: null }],
};

test("loads only the active semester's assigned startup through the user client", async () => {
  const { fake, queried } = client(fixture);
  const state = await createSupabaseStartupLogoRepository(fake).loadForProfile("profile-1");
  assert.equal(state.organizationId, "organization-1");
  assert.equal(state.companyName, "Example");
  assert.deepEqual(queried.map((entry) => entry.table), [
    "semesters", "semester_memberships", "startup_team_memberships", "startup_semesters", "startup_organizations",
  ]);
  assert.deepEqual(queried[0].filters, [["is_active", true]]);
  assert.deepEqual(queried[1].filters, [
    ["profile_id", "profile-1"], ["semester_id", "semester-1"], ["role", "startup"], ["status", ["onboarding", "active"]],
  ]);
  assert.deepEqual(queried[2].filters, [["semester_id", "semester-1"], ["semester_membership_id", "membership-1"]]);
});

test("missing assignment is ineligible; ambiguous assignment is rejected", async () => {
  const noMembership = client({ ...fixture, semester_memberships: [] });
  assert.equal((await createSupabaseStartupLogoRepository(noMembership.fake).loadForProfile("profile-1")).eligible, false);
  assert.deepEqual(noMembership.queried.map((entry) => entry.table), ["semesters", "semester_memberships"]);
  const missing = client({ ...fixture, startup_team_memberships: [] });
  assert.equal((await createSupabaseStartupLogoRepository(missing.fake).loadForProfile("profile-1")).eligible, false);
  assert.deepEqual(missing.queried.map((entry) => entry.table), ["semesters", "semester_memberships", "startup_team_memberships"]);
  const ambiguous = client({ ...fixture, startup_team_memberships: [{ startup_semester_id: "startup-1" }, { startup_semester_id: "startup-2" }] });
  await assert.rejects(createSupabaseStartupLogoRepository(ambiguous.fake).loadForProfile("profile-1"), /ambiguous/u);
  assert.deepEqual(ambiguous.queried.map((entry) => entry.table), ["semesters", "semester_memberships", "startup_team_memberships"]);
});

test("missing deployed logo column reports unavailable", async () => {
  const { fake } = client(fixture, { missingLogoColumn: true });
  await assert.rejects(createSupabaseStartupLogoRepository(fake).loadForProfile("profile-1"), StartupLogoUnavailableError);
});

test("missing private bucket reports unavailable instead of a generic storage failure", async () => {
  const { fake } = client(fixture);
  const storageClient = {
    ...fake,
    storage: {
      from: () => ({
        upload: async () => ({ error: { statusCode: "404", message: "Bucket not found" } }),
      }),
    },
  } as unknown as Parameters<typeof createSupabaseStartupLogoRepository>[0];
  await assert.rejects(
    createSupabaseStartupLogoRepository(storageClient).upload("organization-1/logo.png", new File(["x"], "logo.png")),
    StartupLogoUnavailableError,
  );
});
