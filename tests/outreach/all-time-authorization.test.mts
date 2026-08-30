import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import type { Database } from "../../src/db/types.ts";
import { AuthorizationError } from "../../src/auth/server.ts";
import { createRequireAllTimeOutreachAccess } from "../../src/outreach/server/all-time-authorization.ts";

const user = { id: "00000000-0000-4000-8000-000000000001" } as User;
const semesterRows = [
  { id: "00000000-0000-4000-8000-000000000101", name: "Spring 2027", start_date: "2027-01-01", end_date: "2027-05-01", is_active: true },
  { id: "00000000-0000-4000-8000-000000000102", name: "Fall 2026", start_date: "2026-08-01", end_date: "2026-12-01", is_active: false },
];

function clientWithAccess(canManageAny: boolean, manageableIds: readonly string[]): SupabaseClient<Database> {
  const semesterQuery = {
    select() { return this; },
    order() { return this; },
    limit() { return Promise.resolve({ data: semesterRows, error: null }); },
  };
  return {
    rpc(name: string, args: { target_semester_id?: string }) {
      if (name === "can_manage_any_outreach") return Promise.resolve({ data: canManageAny, error: null });
      return Promise.resolve({
        data: args.target_semester_id !== undefined && manageableIds.includes(args.target_semester_id),
        error: null,
      });
    },
    from() { return semesterQuery; },
  } as unknown as SupabaseClient<Database>;
}

test("all-time outreach rejects an authenticated user without explicit cross-cohort access", async () => {
  const authorize = createRequireAllTimeOutreachAccess(async () => ({
    user,
    userClient: clientWithAccess(false, []),
  }));

  await assert.rejects(
    authorize(new Request("https://almaworks.example.test/outreach")),
    (error: unknown) => error instanceof AuthorizationError
      && error.status === 403
      && /all-time outreach administrator access required/i.test(error.message),
  );
});

test("all-time outreach passes only individually manageable cohort IDs to the workspace query", async () => {
  const authorize = createRequireAllTimeOutreachAccess(async () => ({
    user,
    userClient: clientWithAccess(true, [semesterRows[1].id]),
  }));

  const context = await authorize(new Request("https://almaworks.example.test/outreach"));

  assert.deepEqual(context.manageableSemesters, [{
    id: semesterRows[1].id,
    name: "Fall 2026",
    startsOn: "2026-08-01",
    endsOn: "2026-12-01",
    isActive: false,
  }]);
});
