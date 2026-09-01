import assert from "node:assert/strict";
import test from "node:test";

import * as workspace from "../../src/outreach/workspace.ts";

import {
  buildOutreachHealth,
  decodeOutreachCursor,
  encodeOutreachCursor,
  groupOutreachWorkspaceByOwner,
  sortOutreachWorkspaceItems,
  type OutreachWorkspaceItem,
} from "../../src/outreach/workspace.ts";

const now = "2027-02-15T12:00:00.000Z";

function item(
  overrides: Partial<OutreachWorkspaceItem> = {},
): OutreachWorkspaceItem {
  return {
    id: "opportunity-1",
    semesterId: "4403d7a5-1ff5-4be9-b96c-323893c9ac68",
    contactId: "contact-1",
    contactName: "Ada Lovelace",
    contactEmail: "ada@example.com",
    stage: "contacted",
    ownerProfileId: "owner-1",
    ownerName: "Grace Hopper",
    ownerIsActive: true,
    nextFollowUpAt: "2027-02-15T09:00:00.000Z",
    snoozedUntil: null,
    isSilenced: false,
    latestInboundActivityAt: null,
    latestOutboundActivityAt: "2027-02-14T09:00:00.000Z",
    ...overrides,
  };
}

test("builds operational health counts from queue state and activity chronology", () => {
  const health = buildOutreachHealth(
    [
      item({ id: "overdue", nextFollowUpAt: "2027-02-14T23:59:59.999Z" }),
      item({ id: "due", nextFollowUpAt: "2027-02-15T23:59:59.999Z" }),
      item({ id: "unassigned", ownerProfileId: null, ownerName: null, ownerIsActive: false }),
      item({
        id: "answered",
        latestInboundActivityAt: "2027-02-15T10:00:00.000Z",
        latestOutboundActivityAt: "2027-02-14T09:00:00.000Z",
      }),
      item({ id: "closed", stage: "closed", nextFollowUpAt: "2027-02-01T12:00:00.000Z" }),
    ],
    now,
  );

  assert.deepEqual(health, {
    overdue: 1,
    dueToday: 2,
    unassigned: 1,
    awaitingResponse: 3,
  });
});

test("counts awaiting responses by instant rather than timestamp text ordering", () => {
  const health = buildOutreachHealth(
    [
      item({
        latestOutboundActivityAt: "2027-02-15T08:00:00.000Z",
        latestInboundActivityAt: "2027-02-15T09:00:00.000+02:00",
      }),
    ],
    now,
  );

  assert.equal(health.awaitingResponse, 1);
});

test("groups work by owner and keeps unassigned work in a distinct leading group", () => {
  const groups = groupOutreachWorkspaceByOwner([
    item({ id: "grace", ownerProfileId: "owner-1", ownerName: "Grace Hopper" }),
    item({ id: "ada", ownerProfileId: "owner-2", ownerName: "Ada Lovelace" }),
    item({ id: "unassigned", ownerProfileId: null, ownerName: null, ownerIsActive: false }),
  ]);

  assert.deepEqual(
    groups.map((group) => ({
      ownerProfileId: group.ownerProfileId,
      ownerName: group.ownerName,
      opportunityIds: group.items.map((workspaceItem) => workspaceItem.id),
    })),
    [
      { ownerProfileId: null, ownerName: "Unassigned", opportunityIds: ["unassigned"] },
      { ownerProfileId: "owner-2", ownerName: "Ada Lovelace", opportunityIds: ["ada"] },
      { ownerProfileId: "owner-1", ownerName: "Grace Hopper", opportunityIds: ["grace"] },
    ],
  );
});

test("sorts queue rows by next action, contact name, and stable opportunity identifier", () => {
  const sortedIds = sortOutreachWorkspaceItems([
    item({ id: "later", contactName: "Cora", nextFollowUpAt: "2027-02-16T09:00:00.000Z" }),
    item({ id: "zoe", contactName: "Zoe", nextFollowUpAt: "2027-02-15T09:00:00.000Z" }),
    item({ id: "anna-two", contactName: "Anna", nextFollowUpAt: "2027-02-15T09:00:00.000Z" }),
    item({ id: "anna-one", contactName: "Anna", nextFollowUpAt: "2027-02-15T09:00:00.000Z" }),
    item({ id: "unscheduled", contactName: "Bryn", nextFollowUpAt: null }),
  ]).map((workspaceItem) => workspaceItem.id);

  assert.deepEqual(sortedIds, ["anna-one", "anna-two", "zoe", "later", "unscheduled"]);
});

test("round-trips cursor timestamps without reducing their precision", () => {
  const cursor = {
    nextFollowUpAt: "2027-02-15T12:00:00.123456+05:30",
    id: "a6ed3195-9f45-4c7f-a13b-3c342b3e5cf5",
  };

  assert.deepEqual(decodeOutreachCursor(encodeOutreachCursor(cursor)), cursor);
});

test("round-trips a null next action cursor for the unscheduled tail", () => {
  const cursor = {
    nextFollowUpAt: null,
    id: "2a46e234-65cc-4f38-9d61-c9a35ca585f4",
  };

  assert.deepEqual(decodeOutreachCursor(encodeOutreachCursor(cursor)), cursor);
});

test("round-trips Unicode cursors without a Node Buffer global", () => {
  const bufferDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Buffer");
  Object.defineProperty(globalThis, "Buffer", {
    configurable: true,
    value: undefined,
    writable: true,
  });

  try {
    const cursor = {
      nextFollowUpAt: "2027-02-15T12:00:00.123456+05:30",
      id: "Miyazaki 宮崎 🌱",
    };
    assert.deepEqual(decodeOutreachCursor(encodeOutreachCursor(cursor)), cursor);
  } finally {
    if (bufferDescriptor === undefined) {
      Reflect.deleteProperty(globalThis, "Buffer");
    } else {
      Object.defineProperty(globalThis, "Buffer", bufferDescriptor);
    }
  }
});

test("rejects malformed cursor payloads", () => {
  assert.throws(() => decodeOutreachCursor("not-a-cursor"), /Invalid outreach cursor/);
  assert.throws(() => decodeOutreachCursor("eyJuZXh0Rm9sbG93VXBBdCI6bnVsbH0"), /Invalid outreach cursor/);
});

test("rejects syntactically valid base64url payloads with invalid UTF-8", () => {
  const encoder = new TextEncoder();
  const bytes = new Uint8Array([
    ...encoder.encode('{"nextFollowUpAt":null,"id":"'),
    0xc3,
    ...encoder.encode('"}'),
  ]);
  const payload = btoa(String.fromCharCode(...bytes))
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/gu, "");

  assert.throws(() => decodeOutreachCursor(payload), /Invalid outreach cursor/);
});

test("complete workspace loading follows every cursor without dropping rows", async () => {
  assert.equal(typeof workspace.loadCompleteWorkspacePages, "function");
  const pages = new Map<string | undefined, { rows: readonly string[]; nextCursor: string | null }>([
    [undefined, { rows: ["current-1", "previous-1"], nextCursor: "page-2" }],
    ["page-2", { rows: ["current-2"], nextCursor: null }],
  ]);

  const result = await workspace.loadCompleteWorkspacePages(async (cursor) => {
    const page = pages.get(cursor);
    if (page === undefined) throw new Error("Unexpected cursor");
    return page;
  }, 10);

  assert.deepEqual(result.flatMap((page) => page.rows), ["current-1", "previous-1", "current-2"]);
});

test("complete workspace loading fails loudly instead of returning a bounded partial result", async () => {
  assert.equal(typeof workspace.loadCompleteWorkspacePages, "function");
  await assert.rejects(
    workspace.loadCompleteWorkspacePages(async () => ({
      rows: ["one", "two", "three"],
      nextCursor: "more",
    }), 2),
    /exceeds the 2-row safety bound/i,
  );
});

test("People always resolves to the active outreach semester without a literal semester id", () => {
  const moduleWithResolver = workspace as typeof workspace & {
    resolveOutreachSemesterId?: (
      view: "mine" | "team" | "people",
      requestedSemesterId: string | null,
      semesters: readonly { id: string; isActive: boolean }[],
    ) => string;
  };

  assert.equal(typeof moduleWithResolver.resolveOutreachSemesterId, "function");
  if (moduleWithResolver.resolveOutreachSemesterId === undefined) return;

  const semesters = [
    { id: "spring-2026", isActive: false },
    { id: "fall-2026", isActive: true },
  ];
  assert.equal(moduleWithResolver.resolveOutreachSemesterId("people", "spring-2026", semesters), "fall-2026");
  assert.equal(moduleWithResolver.resolveOutreachSemesterId("people", "all", semesters), "fall-2026");
  assert.equal(moduleWithResolver.resolveOutreachSemesterId("team", "spring-2026", semesters), "spring-2026");
});

test("People retains every active-semester contact while queues contain only assigned open work", () => {
  const moduleWithFilter = workspace as typeof workspace & {
    filterOutreachWorkspaceForView?: (
      items: readonly OutreachWorkspaceItem[],
      view: "mine" | "team" | "people",
      currentProfileId: string | null,
      nowTimestamp: string,
    ) => OutreachWorkspaceItem[];
  };

  assert.equal(typeof moduleWithFilter.filterOutreachWorkspaceForView, "function");
  if (moduleWithFilter.filterOutreachWorkspaceForView === undefined) return;

  const records = [
    item({ id: "unassigned", ownerProfileId: null, ownerName: null, ownerIsActive: false }),
    item({ id: "mine", ownerProfileId: "owner-1", ownerName: "Grace Hopper" }),
    item({ id: "theirs", ownerProfileId: "owner-2", ownerName: "Ada Lovelace" }),
    item({ id: "closed", stage: "closed" }),
    item({ id: "declined", stage: "declined" }),
  ];

  assert.deepEqual(
    moduleWithFilter.filterOutreachWorkspaceForView(records, "people", "owner-1", now).map((row) => row.id),
    ["unassigned", "mine", "theirs", "closed", "declined"],
  );
  assert.deepEqual(
    moduleWithFilter.filterOutreachWorkspaceForView(records, "team", "owner-1", now).map((row) => row.id),
    ["mine", "theirs"],
  );
  assert.deepEqual(
    moduleWithFilter.filterOutreachWorkspaceForView(records, "mine", "owner-1", now).map((row) => row.id),
    ["mine"],
  );
});

test("workspace requests load up to one hundred active-semester people per page", () => {
  const moduleWithQuery = workspace as typeof workspace & {
    buildOutreachWorkspaceQuery?: (input: {
      semesterId: string;
      view: "mine" | "team" | "people";
      cursor?: string;
    }) => string;
  };

  assert.equal(typeof moduleWithQuery.buildOutreachWorkspaceQuery, "function");
  if (moduleWithQuery.buildOutreachWorkspaceQuery === undefined) return;

  assert.equal(
    moduleWithQuery.buildOutreachWorkspaceQuery({ semesterId: "active-semester", view: "people" }),
    "semesterId=active-semester&view=people&pageSize=100",
  );
  assert.equal(
    moduleWithQuery.buildOutreachWorkspaceQuery({ semesterId: "active-semester", view: "people", cursor: "next-page" }),
    "semesterId=active-semester&view=people&pageSize=100&cursor=next-page",
  );
});
