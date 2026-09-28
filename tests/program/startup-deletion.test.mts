import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { StartupDeletionError, parseStartupDeletionRequest } from "../../src/program/server/startup-deletion.ts";

test("permanent startup deletion requires the exact startup name as confirmation", () => {
  assert.deepEqual(
    parseStartupDeletionRequest({ confirmationName: "Test Startup", startupOrganizationId: "organization-id" }),
    { confirmationName: "Test Startup", startupOrganizationId: "organization-id" },
  );
  assert.throws(
    () => parseStartupDeletionRequest({ confirmationName: "", startupOrganizationId: "organization-id" }),
    StartupDeletionError,
  );
});

test("permanent startup deletion releases booking occupancy before removing booking history without opening participant deletion", async () => {
  const schema = (await readFile(new URL("../../supabase/schemas/canonical_schema.sql", import.meta.url), "utf8")).replaceAll('"', "");
  const start = schema.indexOf("CREATE OR REPLACE FUNCTION public.delete_startup_permanently");
  const body = schema.slice(start, schema.indexOf("$$;", start));
  assert.match(body, /delete from public\.mentor_booking_accepted_occupancy occupancy\s+using public\.mentor_booking_requests request\s+where occupancy\.request_id = request\.id\s+and request\.startup_organization_id = p_startup_organization_id;/u);
  assert.match(body, /delete from public\.mentor_booking_requests\s+where startup_organization_id = p_startup_organization_id;/u);
  assert.ok(body.indexOf("delete from public.mentor_booking_accepted_occupancy") < body.indexOf("delete from public.mentor_booking_requests"));
  assert.ok(body.indexOf("delete from public.mentor_booking_requests") < body.indexOf("delete from public.startup_organizations"));
  assert.doesNotMatch(body, /delete from public\.(mentor_weekly_availability|mentor_booking_windows|profiles|semester_memberships)/u);
  const calendar = await readFile(new URL("../../supabase/schemas/mentor_booking_calendar.sql", import.meta.url), "utf8");
  assert.match(calendar, /if tg_op='DELETE' and current_user='postgres' and private\.is_super_admin\(auth\.uid\(\)\) then\s+return old;/u);
  assert.match(calendar, /raise exception 'Booking history cannot be deleted' using errcode='42501'/u);
});

test("confirmed permanent deletion clears only the target startup's Friday assignments before deleting its organization", async () => {
  const schema = (await readFile(new URL("../../supabase/schemas/canonical_schema.sql", import.meta.url), "utf8"))
    .replaceAll('"', "");
  const start = schema.indexOf("CREATE OR REPLACE FUNCTION public.delete_startup_permanently");
  assert.notEqual(start, -1);
  const body = schema.slice(start, schema.indexOf("$$;", start));
  assert.match(body, /delete from public\.friday_program_assignments\s+where startup_organization_id = p_startup_organization_id;/u);
  const cleanup = body.indexOf("delete from public.friday_program_assignments");
  assert.ok(body.indexOf("private.is_super_admin") < cleanup);
  assert.ok(body.indexOf("Startup name confirmation does not match") < cleanup);
  assert.ok(cleanup < body.indexOf("delete from public.startup_organizations"));
  assert.doesNotMatch(body, /delete from public\.friday_programs/u);
});

test("startup deletion reconciles Friday roster positions/counts and permits an empty publication", async () => {
  const schema = (await readFile(new URL("../../supabase/schemas/canonical_schema.sql", import.meta.url), "utf8")).replaceAll('"', "");
  const start = schema.indexOf("CREATE OR REPLACE FUNCTION public.delete_startup_permanently");
  const body = schema.slice(start, schema.indexOf("$$;", start));
  assert.match(body, /update public\.friday_programs\s+set startup_count =/u);
  assert.match(body, /row_number\(\) over \(order by group_code, group_position, id\)/u);
  assert.match(body, /insert into public\.friday_program_assignments/u);
  const friday = await readFile(new URL("../../supabase/schemas/friday_program.sql", import.meta.url), "utf8");
  assert.match(friday, /friday_programs_startup_count_check check \(startup_count >= 0\)/u);
  assert.doesNotMatch(friday, /if v_assignment_count = 0/u);
  const sharedLock = "pg_catalog.hashtextextended('almaworks:friday-roster-maintenance', 0)";
  assert.ok(body.indexOf(sharedLock) >= 0);
  assert.ok(body.indexOf(sharedLock) < body.indexOf("for update"));
  const generator = friday.slice(friday.indexOf("create function public.generate_friday_program"));
  assert.ok(generator.indexOf(sharedLock) >= 0);
  assert.ok(generator.indexOf(sharedLock) < generator.indexOf("p_semester_id::text || ':' || p_meeting_id::text"));
  assert.match(friday, /v_allow_alumni and membership\.status = 'alumni'/u);
  const databaseTest = await readFile(new URL("../../supabase/tests/database/startup_deletion.test.sql", import.meta.url), "utf8");
  assert.match(databaseTest, /set constraints all immediate;/u);
});
