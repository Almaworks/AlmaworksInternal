import assert from "node:assert/strict";
import test from "node:test";

import {
  loadParticipantDashboardSnapshot,
  loadParticipantProfileUpdateSnapshot,
  type ParticipantSnapshotClient,
} from "../../src/dashboard/participant-snapshot-loader.ts";

type QueryError = { message: string } | null;
type QueryResponse = { data: unknown; error: QueryError };
type Filter = { column: string; operation: string; value: unknown };
type QueryDescriptor = {
  columns: string;
  filters: Filter[];
  operation: "select" | "update";
  payload?: unknown;
  table: string;
};

type ResponseFactory = (query: QueryDescriptor) => Promise<QueryResponse> | QueryResponse;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => { resolve = settle; });
  return { promise, resolve };
}

function hasFilter(query: QueryDescriptor, column: string, value: unknown): boolean {
  return query.filters.some((filter) => filter.column === column && filter.value === value);
}

function createRlsClient(responseFor: ResponseFactory) {
  const started: QueryDescriptor[] = [];
  const signedPaths: string[][] = [];

  class QueryBuilder implements PromiseLike<QueryResponse> {
    private readonly descriptor: QueryDescriptor;

    constructor(table: string) {
      this.descriptor = { columns: "", filters: [], operation: "select", table };
    }

    select(columns: string) {
      this.descriptor.columns = columns;
      return this;
    }

    update(payload: unknown) {
      this.descriptor.operation = "update";
      this.descriptor.payload = payload;
      return this;
    }

    eq(column: string, value: unknown) {
      this.descriptor.filters.push({ column, operation: "eq", value });
      return this;
    }

    gte(column: string, value: unknown) {
      this.descriptor.filters.push({ column, operation: "gte", value });
      return this;
    }

    in(column: string, value: unknown) {
      this.descriptor.filters.push({ column, operation: "in", value });
      return this;
    }

    limit() { return this; }
    maybeSingle() { return this; }
    order() { return this; }

    then<TResult1 = QueryResponse, TResult2 = never>(
      onfulfilled?: ((value: QueryResponse) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      const snapshot = structuredClone(this.descriptor);
      started.push(snapshot);
      return Promise.resolve(responseFor(snapshot)).then(onfulfilled, onrejected);
    }
  }

  const client = {
    from: (table: string) => new QueryBuilder(table),
    storage: {
      from: () => ({
        createSignedUrl: async (path: string) => {
          signedPaths.push([path]);
          return { data: { signedUrl: `https://photos.example/${path}` }, error: null };
        },
        createSignedUrls: async (paths: string[]) => {
          signedPaths.push(paths);
          return {
            data: paths.map((path) => ({ error: null, path, signedUrl: `https://photos.example/${path}` })),
            error: null,
          };
        },
      }),
    },
  };

  return { client: client as unknown as ParticipantSnapshotClient, signedPaths, started };
}

const mentorUser = {
  email: "mentor@example.com",
  email_confirmed_at: "2026-09-01T00:00:00Z",
};

function mentorResponse(query: QueryDescriptor): QueryResponse {
  if (query.table === "semesters") {
    return { data: { id: "fall", name: "Fall 2026", configuration: {} }, error: null };
  }
  if (query.table === "semester_memberships" && hasFilter(query, "profile_id", "mentor")) {
    return {
      data: [
        { id: "admin-member", profile_id: "mentor", role: "admin", semester_id: "fall", status: "active" },
        { id: "mentor-member", profile_id: "mentor", role: "mentor", semester_id: "fall", status: "active" },
        { id: "startup-member", profile_id: "mentor", role: "startup", semester_id: "fall", status: "active" },
      ],
      error: null,
    };
  }
  if (query.table === "profiles" && hasFilter(query, "id", "mentor")) {
    return { data: { id: "mentor", full_name: "Mentor Person", email: "mentor@example.com", photo_path: "mentor/photo.jpg" }, error: null };
  }
  if (query.table === "mentor_profiles" && query.columns === "photo_url") {
    return { data: { photo_url: "https://legacy.example/mentor.jpg" }, error: null };
  }
  if (query.table === "participant_notification_reads") {
    return { data: [{ notification_key: "activation-profile" }], error: null };
  }
  if (query.table === "startup_semesters") return { data: [], error: null };
  if (query.table === "mentor_profiles" && query.columns.startsWith("biography")) {
    return {
      data: {
        biography: "Operator and advisor", company: "Alma", expertise_tags: ["Pricing"],
        linkedin_url: "https://linkedin.example/mentor", title: "Founder", website_url: "https://mentor.example",
      },
      error: null,
    };
  }
  if (query.table === "mentor_weekly_availability") {
    return {
      data: [
        { weekday: 1, starts_at: "09:00:00", ends_at: "10:00:00", mentor_semesters: { semester_memberships: { profile_id: "someone-else" } } },
        { weekday: 2, starts_at: "11:00:00", ends_at: "12:00:00", mentor_semesters: [{ semester_memberships: [{ profile_id: "mentor" }] }] },
      ],
      error: null,
    };
  }
  if (query.table === "mentor_booking_requests" && query.columns.startsWith("starts_at")) {
    return { data: [{ starts_at: "2026-10-01T15:00:00Z", ends_at: "2026-10-01T15:30:00Z", startup_name: "Acme", topic: "Pricing" }], error: null };
  }
  if (query.table === "mentor_booking_requests") {
    return { data: [{ id: "request-1", requested_at: "2026-09-10T12:00:00Z", starts_at: "2026-10-01T15:00:00Z", ends_at: "2026-10-01T15:30:00Z", startup_name: "Acme", status: "pending", topic: "Pricing" }], error: null };
  }
  if (query.table === "semester_memberships" && hasFilter(query, "semester_id", "fall")) {
    return {
      data: [
        { id: "mentor-member", profile_id: "mentor", role: "mentor", semester_id: "fall", status: "active" },
        { id: "peer-member", profile_id: "peer", role: "mentor", semester_id: "fall", status: "active" },
      ],
      error: null,
    };
  }
  if (query.table === "profiles" && query.filters.some((filter) => filter.operation === "in")) {
    return {
      data: [
        { id: "mentor", full_name: "Mentor Person", email: "mentor@example.com", photo_path: "mentor/photo.jpg" },
        { id: "peer", full_name: "Peer Mentor", email: "peer@example.com", photo_path: "peer/photo.jpg" },
      ],
      error: null,
    };
  }
  if (query.table === "mentor_profiles" && query.columns.startsWith("profile_id")) {
    return {
      data: [
        { profile_id: "mentor", biography: "Operator", company: "Alma", title: "Founder", linkedin_url: null, website_url: null, photo_url: null, expertise_tags: ["Pricing"] },
        { profile_id: "peer", biography: "Growth advisor", company: "Peer Co", title: "Advisor", linkedin_url: null, website_url: null, photo_url: null, expertise_tags: ["Growth"] },
      ],
      error: null,
    };
  }
  if (query.table === "startup_team_memberships") return { data: [], error: null };
  throw new Error(`Unexpected query: ${query.table} ${query.columns}`);
}

function startupResponse(query: QueryDescriptor): QueryResponse {
  if (query.table === "semesters") {
    return { data: { id: "fall", name: "Fall 2026", configuration: {} }, error: null };
  }
  if (query.table === "semester_memberships" && hasFilter(query, "profile_id", "founder")) {
    return { data: [{ id: "founder-member", profile_id: "founder", role: "startup", semester_id: "fall", status: "active" }], error: null };
  }
  if (query.table === "profiles" && hasFilter(query, "id", "founder")) {
    return { data: { id: "founder", full_name: "Founder Person", email: "founder@example.com", photo_path: null }, error: null };
  }
  if (query.table === "mentor_profiles" && query.columns === "photo_url") {
    return { data: null, error: null };
  }
  if (query.table === "participant_notification_reads") return { data: [], error: null };
  if (query.table === "startup_semesters") {
    return {
      data: [{
        id: "startup-1", semester_id: "fall", startup_organization_id: "org-1", company_snapshot: "Analytics for operators",
        stage: "pilot", goals: ["Launch"], mentorship_needs: ["Pricing"], mentor_need_context: "Packaging help",
        mentor_need_no_preference: false, readiness_status: "ready",
        startup_organizations: { id: "org-1", name: "Northstar", description: "Analytics", industry: "SaaS", website_url: "https://northstar.example", logo_url: null },
      }],
      error: null,
    };
  }
  if (query.table === "startup_team_memberships" && query.columns === "startup_semester_id") {
    return { data: { startup_semester_id: "startup-1" }, error: null };
  }
  if (query.table === "startup_team_memberships") {
    return { data: [{ startup_semester_id: "startup-1", semester_membership_id: "founder-member" }], error: null };
  }
  if (query.table === "semester_memberships" && hasFilter(query, "semester_id", "fall")) {
    return {
      data: [
        { id: "founder-member", profile_id: "founder", role: "startup", semester_id: "fall", status: "active" },
        { id: "peer-member", profile_id: "peer", role: "mentor", semester_id: "fall", status: "active" },
      ],
      error: null,
    };
  }
  if (query.table === "profiles" && query.filters.some((filter) => filter.operation === "in")) {
    return {
      data: [
        { id: "founder", full_name: "Founder Person", email: "founder@example.com", photo_path: null },
        { id: "peer", full_name: "Peer Mentor", email: "peer@example.com", photo_path: null },
      ],
      error: null,
    };
  }
  if (query.table === "mentor_profiles" && query.columns.startsWith("profile_id")) {
    return { data: [{ profile_id: "peer", biography: "Advisor", company: "Peer Co", title: "Mentor", linkedin_url: null, website_url: null, photo_url: null, expertise_tags: ["Pricing"] }], error: null };
  }
  if (query.table === "mentor_booking_requests" && query.columns.startsWith("starts_at")) {
    return { data: [{ starts_at: "2026-10-02T15:00:00Z", ends_at: "2026-10-02T15:30:00Z", mentor_name: "Peer Mentor", topic: "Pricing" }], error: null };
  }
  if (query.table === "mentor_booking_requests") {
    return { data: [{ id: "request-2", responded_at: "2026-09-11T12:00:00Z", mentor_name: "Peer Mentor", status: "accepted", topic: "Pricing" }], error: null };
  }
  throw new Error(`Unexpected startup query: ${query.table} ${query.columns}`);
}

test("dashboard loading overlaps independent participant reads after membership resolution", async () => {
  const release = deferred<QueryResponse>();
  const gatedTables = new Set([
    "participant_notification_reads",
    "startup_semesters",
    "mentor_weekly_availability",
    "startup_team_memberships",
  ]);
  const { client, started } = createRlsClient((query) => {
    if (gatedTables.has(query.table)) return release.promise;
    return mentorResponse(query);
  });

  const pending = loadParticipantDashboardSnapshot(client, mentorUser, "mentor");
  await new Promise<void>((resolve) => setImmediate(resolve));

  const activeTables = new Set(started.map((query) => query.table));
  assert.ok(activeTables.has("participant_notification_reads"), "notification receipts should start without waiting for cohort rows");
  assert.ok(activeTables.has("startup_semesters"), "startup rows should start without waiting for notifications");
  assert.ok(activeTables.has("mentor_weekly_availability"), "role reads should start with other participant reads");
  assert.ok(activeTables.has("startup_team_memberships"), "team rows should start with other participant reads");

  release.resolve({ data: [], error: null });
  await pending;
});

test("mentor snapshots prefer the mentor role and never expose another mentor's availability", async () => {
  const { client, signedPaths, started } = createRlsClient(mentorResponse);

  const snapshot = await loadParticipantDashboardSnapshot(client, mentorUser, "mentor");

  assert.deepEqual(snapshot.weeklyAvailability, [{ weekday: 2, startsAt: "11:00:00", endsAt: "12:00:00" }]);
  assert.deepEqual(snapshot.bookingNotifications, [{ requestId: "request-1", status: "pending", counterpartName: "Acme", topic: "Pricing", durationMinutes: 30, createdAt: "2026-09-10T12:00:00Z" }]);
  assert.deepEqual(snapshot.network.map((person) => person.id), ["peer"]);
  assert.equal(snapshot.identity.photoUrl, "https://photos.example/mentor/photo.jpg");
  assert.deepEqual(signedPaths, [["mentor/photo.jpg"], ["peer/photo.jpg"]]);
  assert.equal(started.some((query) => query.table === "startup_team_memberships" && hasFilter(query, "semester_membership_id", "startup-member")), false);
});

test("startup booking reads wait for the caller's team while independent cohort reads continue", async () => {
  const teamAssignment = deferred<QueryResponse>();
  const { client, started } = createRlsClient((query) => (
    query.table === "startup_team_memberships" && query.columns === "startup_semester_id"
      ? teamAssignment.promise
      : startupResponse(query)
  ));

  const pending = loadParticipantDashboardSnapshot(
    client,
    { email: "founder@example.com", email_confirmed_at: "2026-09-01T00:00:00Z" },
    "founder",
  );
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.ok(started.some((query) => query.table === "participant_notification_reads"));
  assert.ok(started.some((query) => query.table === "startup_semesters"));
  assert.ok(started.some((query) => query.table === "startup_team_memberships" && query.columns.includes("semester_membership_id")));
  assert.equal(started.some((query) => query.table === "mentor_booking_requests"), false);

  teamAssignment.resolve({ data: { startup_semester_id: "startup-1" }, error: null });
  const snapshot = await pending;
  assert.equal(snapshot.startupSemesterId, "startup-1");
  assert.equal(snapshot.startupProfile?.name, "Northstar");
  assert.equal(snapshot.startupProfile?.stage, "pilot");
  assert.deepEqual(snapshot.upcomingMeetings?.map((meeting) => meeting.counterpartName), ["Peer Mentor"]);
  assert.ok(started.filter((query) => query.table === "mentor_booking_requests").every((query) => hasFilter(query, "startup_semester_id", "startup-1")));
});

test("admin-only accounts return identity-only data without starting participant or network reads", async () => {
  const { client, started } = createRlsClient((query) => {
    if (query.table === "semesters") return { data: { id: "fall", name: "Fall 2026", configuration: {} }, error: null };
    if (query.table === "semester_memberships") {
      return { data: [{ id: "admin-member", profile_id: "pending", role: "admin", semester_id: "fall", status: "active" }], error: null };
    }
    if (query.table === "profiles") return { data: { id: "pending", full_name: "Pending Person", email: "pending@example.com", photo_path: null }, error: null };
    if (query.table === "mentor_profiles") return { data: null, error: null };
    throw new Error(`Pending account leaked into ${query.table}`);
  });

  const snapshot = await loadParticipantDashboardSnapshot(client, { email: "pending@example.com", email_confirmed_at: undefined }, "pending");

  assert.equal(snapshot.network.length, 0);
  assert.equal(snapshot.identity.emailVerified, false);
  assert.deepEqual(new Set(started.map((query) => query.table)), new Set(["semesters", "semester_memberships", "profiles", "mentor_profiles"]));
});

test("participant read errors reject the whole snapshot instead of returning partial role data", async () => {
  const { client } = createRlsClient((query) => {
    if (query.table === "participant_notification_reads") {
      return { data: null, error: { message: "notification receipts denied" } };
    }
    return mentorResponse(query);
  });

  await assert.rejects(
    loadParticipantDashboardSnapshot(client, mentorUser, "mentor"),
    /notification receipts denied/u,
  );
});

test("profile update context loading reads only active semester membership state", async () => {
  const { client, started } = createRlsClient((query) => {
    if (query.table === "semesters") return { data: { id: "fall", name: "Fall 2026", configuration: {} }, error: null };
    if (query.table === "semester_memberships") {
      return { data: [{ id: "mentor-member", profile_id: "mentor", role: "mentor", semester_id: "fall", status: "active" }], error: null };
    }
    throw new Error(`Profile update loaded unrelated table ${query.table}`);
  });

  const snapshot = await loadParticipantProfileUpdateSnapshot(client, mentorUser, "mentor");

  assert.equal(snapshot.activeSemester?.id, "fall");
  assert.equal(snapshot.memberships[0]?.role, "mentor");
  assert.deepEqual(new Set(started.map((query) => query.table)), new Set(["semesters", "semester_memberships"]));
});
