import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../src/db/types.ts";
import {
  loadAuthorizedAllTimeOutreachDirectory,
  loadOutreachWorkspace,
  type LoadOutreachWorkspaceOptions,
} from "../../src/outreach/server/repository.ts";

type QueryResult = { data: readonly Record<string, unknown>[] | null; error: { message: string } | null };

class QueryBuilder implements PromiseLike<QueryResult> {
  private equality = new Map<string, unknown>();
  private inclusion = new Map<string, readonly unknown[]>();
  private maximum = Number.POSITIVE_INFINITY;
  private offset = 0;
  private readonly rows: readonly Record<string, unknown>[];

  constructor(
    _table: string,
    rows: readonly Record<string, unknown>[],
  ) { this.rows = rows; }

  select(): this { return this; }
  order(): this { return this; }
  or(): this { return this; }
  is(): this { return this; }
  gt(): this { return this; }
  maybeSingle(): this { return this; }
  eq(column: string, value: unknown): this { this.equality.set(column, value); return this; }
  in(column: string, values: readonly unknown[]): this { this.inclusion.set(column, values); return this; }
  limit(value: number): this { this.maximum = value; return this; }
  range(from: number, to: number): this { this.offset = from; this.maximum = to - from + 1; return this; }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const data = this.rows
      .filter((row) => [...this.equality].every(([column, value]) => row[column] === value))
      .filter((row) => [...this.inclusion].every(([column, values]) => values.includes(row[column])))
      .slice(this.offset, this.offset + this.maximum);
    return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
  }
}

function directoryClientFor(contacts: readonly Record<string, unknown>[]): SupabaseClient<Database> {
  return {
    from(table: string) {
      return new QueryBuilder(table, table === "outreach_contacts" ? contacts : []);
    },
  } as unknown as SupabaseClient<Database>;
}

function clientFor(opportunities: readonly Record<string, unknown>[]): SupabaseClient<Database> {
  const contacts = opportunities.map((row, index) => ({
    id: row.contact_id,
    full_name: `Contact ${index + 1}`,
    email: `contact-${index + 1}@example.test`,
    biography: null,
  }));
  const tables: Record<string, readonly Record<string, unknown>[]> = {
    outreach_opportunities: opportunities,
    outreach_contacts: contacts,
    profiles: [],
    outreach_contact_companies: [],
    outreach_companies: [],
    outreach_opportunity_labels: [],
    outreach_relationship_labels: [],
  };
  return {
    from(table: string) {
      return new QueryBuilder(table, tables[table] ?? []);
    },
  } as unknown as SupabaseClient<Database>;
}

const semesters = {
  current: "4403d7a5-1ff5-4be9-b96c-323893c9ac68",
  previous: "5503d7a5-1ff5-4be9-b96c-323893c9ac68",
};

function opportunity(index: number, semesterId = semesters.current): Record<string, unknown> {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    semester_id: semesterId,
    contact_id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    owner_profile_id: null,
    stage: "prospect",
    cadence_days: 14,
    next_follow_up_at: `2027-02-${String(index).padStart(2, "0")}T12:00:00.000Z`,
    snoozed_until: null,
    is_silenced: false,
    silence_reason: null,
    latest_inbound_activity_at: null,
    latest_outbound_activity_at: null,
    updated_at: "2027-01-01T00:00:00.000Z",
  };
}

test("a terminal workspace page is not advertised as incomplete when it exactly fills the page", async () => {
  const page = await loadOutreachWorkspace(clientFor([opportunity(1), opportunity(2)]), {
    semesterId: semesters.current,
    pageSize: 2,
  });

  assert.equal(page.items.length, 2);
  assert.equal(page.nextCursor, null);
});

test("all-time workspace pages include only explicitly authorized semesters and retain cohort identity", async () => {
  const options = {
    authorization: "all_time_workspace",
    semesterIds: [semesters.current, semesters.previous],
    pageSize: 3,
  } as unknown as LoadOutreachWorkspaceOptions;
  const page = await loadOutreachWorkspace(clientFor([
    opportunity(1, semesters.current),
    opportunity(2, semesters.previous),
    opportunity(3, "6603d7a5-1ff5-4be9-b96c-323893c9ac68"),
  ]), options);

  assert.deepEqual(page.items.map((row) => row.semesterId), [semesters.current, semesters.previous]);
  assert.equal(page.nextCursor, null);
});

test("all-time workspace loading rejects a missing explicit authorization marker", async () => {
  const options = {
    semesterIds: [semesters.current],
    pageSize: 2,
  } as unknown as LoadOutreachWorkspaceOptions;

  await assert.rejects(
    loadOutreachWorkspace(clientFor([opportunity(1)]), options),
    /explicit all-time workspace authorization is required/i,
  );
});

test("the legacy all-time contact directory drains every database page", async () => {
  const contacts = [1, 2, 3].map((index) => ({
    id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    full_name: `Contact ${index}`,
    email: null,
    linkedin_url: null,
    biography: null,
    expertise_tags: [],
    updated_at: "2027-01-01T00:00:00.000Z",
  }));

  const loaded = await loadAuthorizedAllTimeOutreachDirectory(directoryClientFor(contacts), {
    authorization: "all_time_directory",
    pageSize: 2,
  });

  assert.deepEqual(loaded.map((contact) => contact.fullName), ["Contact 1", "Contact 2", "Contact 3"]);
});
