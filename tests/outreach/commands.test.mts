import assert from "node:assert/strict";
import test from "node:test";

import type { Database, Json } from "../../src/db/types.ts";
import {
  createSuspendOutreachMembershipCommand,
  type AuthorizeMembershipSuspension,
  type MembershipSuspensionRpcClient,
} from "../../src/auth/server.ts";
import {
  createOutreachCommands,
  OutreachCommandValidationError,
  type AuthorizeOutreachCommand,
  type OutreachCommandRpcClient,
  type OutreachRpcResponse,
} from "../../src/outreach/server/commands.ts";
import {
  createUpdateOutreachContactCommand,
  type AuthorizeContactUpdate,
  type ContactUpdateClient,
} from "../../src/outreach/server/contact-commands.ts";

type ActivityRow = Database["public"]["Functions"]["log_outreach_activity"]["Returns"];
type OpportunityRow = Database["public"]["Functions"]["set_outreach_snooze"]["Returns"];

const semesterId = "4403d7a5-1ff5-4be9-b96c-323893c9ac68";
const opportunityId = "f89fdf50-3d96-4993-8966-d16579d21652";
const ownerProfileId = "041e14c4-fcbf-4ec9-a125-86116b6a87de";
const occurredAt = "2027-02-15T12:00:00.000Z";
const updatedAt = "2027-02-14T09:00:00.000Z";
const contactId = "ce2aca63-a915-4e44-8f48-e2a2858cb2c8";

const activityRow: ActivityRow = {
  activity_kind: "note",
  actor_profile_id: ownerProfileId,
  channel: null,
  created_at: occurredAt,
  details: {} satisfies Json,
  external_message_id: null,
  id: "2e227d13-40b8-4d4a-9469-f265988cc88f",
  new_owner_profile_id: null,
  occurred_at: occurredAt,
  opportunity_id: opportunityId,
  previous_owner_profile_id: null,
  semester_id: semesterId,
  summary: "Introduced by the program director",
  supersedes_activity_id: null,
};

const opportunityRow: OpportunityRow = {
  archived_at: null,
  archived_by: null,
  cadence_days: 7,
  contact_id: "ce2aca63-a915-4e44-8f48-e2a2858cb2c8",
  created_at: "2027-02-01T09:00:00.000Z",
  created_by: ownerProfileId,
  id: opportunityId,
  is_silenced: false,
  latest_inbound_activity_at: null,
  latest_outbound_activity_at: null,
  next_follow_up_at: "2027-02-20T12:00:00.000Z",
  owner_profile_id: ownerProfileId,
  priority: 0,
  referred_by: null,
  relationship_types: ["mentor"],
  semester_id: semesterId,
  semester_notes: null,
  silence_reason: null,
  silenced_at: null,
  silenced_by: null,
  snoozed_until: null,
  source_channel: null,
  source_context: {} satisfies Json,
  stage: "not_contacted",
  updated_at: "2027-02-15T12:00:00.000Z",
};

function successful<T>(data: T): OutreachRpcResponse<T> {
  return { data, error: null };
}

function createFakeClient(
  events: string[],
  overrides: Partial<OutreachCommandRpcClient> = {},
): OutreachCommandRpcClient {
  return {
    checkActiveOwner: async () => {
      events.push("check-owner");
      return successful(true);
    },
    logActivity: async () => {
      events.push("rpc:log");
      return successful(activityRow);
    },
    transferOwner: async () => {
      events.push("rpc:transfer");
      return successful(opportunityRow);
    },
    snoozeOpportunity: async () => {
      events.push("rpc:snooze");
      return successful(opportunityRow);
    },
    silenceOpportunity: async () => {
      events.push("rpc:silence");
      return successful(opportunityRow);
    },
    releaseInactiveOwnerWork: async () => {
      events.push("rpc:release");
      return successful([{ opportunity_id: opportunityId }]);
    },
    ...overrides,
  };
}

function createHarness(overrides: Partial<OutreachCommandRpcClient> = {}) {
  const events: string[] = [];
  const authorizations: Array<{ request: Request; semesterId: string }> = [];
  const client = createFakeClient(events, overrides);
  const authorize: AuthorizeOutreachCommand = async (request, authorizedSemesterId) => {
    events.push("authorize");
    authorizations.push({ request, semesterId: authorizedSemesterId });
    return client;
  };

  return {
    authorizations,
    commands: createOutreachCommands(authorize),
    events,
    request: new Request("https://almaworks.example.test/outreach"),
  };
}

test("contact updates authorize the semester and conditionally persist normalized changes", async () => {
  const events: string[] = [];
  const request = new Request("https://almaworks.example.test/outreach/contacts");
  const client: ContactUpdateClient = {
    updateContact: async (input) => {
      events.push("update");
      assert.deepEqual(input, {
        contactId,
        expectedUpdatedAt: updatedAt,
        changes: { fullName: "Ada Lovelace", email: "ada@example.com", biography: null },
      });
      return {
        data: {
          id: contactId,
          full_name: "Ada Lovelace",
          email: "ada@example.com",
          linkedin_url: null,
          phone: null,
          biography: null,
          expertise_tags: [],
          notes: null,
          updated_at: occurredAt,
        },
        error: null,
      };
    },
  };
  const authorize: AuthorizeContactUpdate = async (authorizedRequest, authorizedSemesterId) => {
    events.push("authorize");
    assert.equal(authorizedRequest, request);
    assert.equal(authorizedSemesterId, semesterId);
    return client;
  };

  const result = await createUpdateOutreachContactCommand(authorize)({
    request,
    semesterId,
    contactId,
    updatedAt,
    changes: { fullName: "Ada Lovelace", email: "ada@example.com", biography: null },
  });

  assert.deepEqual(events, ["authorize", "update"]);
  assert.deepEqual(result, {
    ok: true,
    value: {
      id: contactId,
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      linkedinUrl: null,
      phone: null,
      biography: null,
      expertiseTags: [],
      notes: null,
      updatedAt: occurredAt,
    },
  });
});

test("a contact update reports an optimistic-concurrency conflict without overwriting", async () => {
  const client: ContactUpdateClient = {
    updateContact: async () => ({ data: null, error: null }),
  };

  const result = await createUpdateOutreachContactCommand(async () => client)({
    request: new Request("https://almaworks.example.test/outreach/contacts"),
    semesterId,
    contactId,
    updatedAt,
    changes: { phone: "555-0100" },
  });

  assert.deepEqual(result, {
    ok: false,
    error: {
      kind: "conflict",
      code: "stale_updated_at",
      message: "Outreach contact changed after it was loaded.",
    },
  });
});

test("outbound email, call, and LinkedIn activities require a channel", async () => {
  for (const activityKind of ["email", "call", "linkedin"] as const) {
    const { commands, events, request } = createHarness();
    const invoke = commands.logActivity as (input: unknown) => Promise<unknown>;

    await assert.rejects(
      invoke({
        request,
        semesterId,
        opportunityId,
        activityKind,
        occurredAt,
        updatedAt,
      }),
      (error: unknown) =>
        error instanceof OutreachCommandValidationError
        && error.field === "channel",
    );
    assert.deepEqual(events, []);
  }
});

test("email and LinkedIn activity channels must match their outbound medium", async () => {
  for (const activity of [
    { activityKind: "email", channel: "linkedin" },
    { activityKind: "linkedin", channel: "email" },
  ] as const) {
    const { commands, events, request } = createHarness();
    const invoke = commands.logActivity as (input: unknown) => Promise<unknown>;

    await assert.rejects(
      invoke({
        request,
        semesterId,
        opportunityId,
        occurredAt,
        updatedAt,
        ...activity,
      }),
      (error: unknown) =>
        error instanceof OutreachCommandValidationError
        && error.field === "channel",
    );
    assert.deepEqual(events, []);
  }
});

test("silencing requires a non-empty reason", async () => {
  const { commands, events, request } = createHarness();
  const invoke = commands.silenceOpportunity as (input: unknown) => Promise<unknown>;

  await assert.rejects(
    invoke({
      request,
      semesterId,
      opportunityId,
      silence: true,
      reason: "   ",
      updatedAt,
    }),
    (error: unknown) =>
      error instanceof OutreachCommandValidationError
      && error.field === "reason",
  );
  assert.deepEqual(events, []);
});

test("restoring a silenced opportunity requires a next action", async () => {
  const { commands, events, request } = createHarness();
  const invoke = commands.silenceOpportunity as (input: unknown) => Promise<unknown>;

  await assert.rejects(
    invoke({
      request,
      semesterId,
      opportunityId,
      silence: false,
      updatedAt,
    }),
    (error: unknown) =>
      error instanceof OutreachCommandValidationError
      && error.field === "nextFollowUpAt",
  );
  assert.deepEqual(events, []);
});

test("transfer rejects a profile without active admin membership in the semester", async () => {
  const events: string[] = [];
  const client = createFakeClient(events, {
    checkActiveOwner: async () => {
      events.push("check-owner");
      return successful(false);
    },
  });
  const commands = createOutreachCommands(async () => {
    events.push("authorize");
    return client;
  });

  await assert.rejects(
    commands.transferOwner({
      request: new Request("https://almaworks.example.test/outreach"),
      semesterId,
      opportunityId,
      newOwnerProfileId: ownerProfileId,
      updatedAt,
    }),
    (error: unknown) =>
      error instanceof OutreachCommandValidationError
      && error.field === "newOwnerProfileId",
  );
  assert.deepEqual(events, ["authorize", "check-owner"]);
});

test("commands reject timestamps without a valid ISO timezone before authorization", async () => {
  const { commands, events, request } = createHarness();

  await assert.rejects(
    commands.logActivity({
      request,
      semesterId,
      opportunityId,
      activityKind: "note",
      occurredAt: "2027-02-15T12:00:00",
      updatedAt,
    }),
    (error: unknown) =>
      error instanceof OutreachCommandValidationError
      && error.field === "occurredAt",
  );
  await assert.rejects(
    commands.snoozeOpportunity({
      request,
      semesterId,
      opportunityId,
      snoozedUntil: "not-a-date",
      updatedAt,
    }),
    (error: unknown) =>
      error instanceof OutreachCommandValidationError
      && error.field === "snoozedUntil",
  );
  assert.deepEqual(events, []);
});

test("authorization receives the semester boundary and completes before the RPC", async () => {
  const { authorizations, commands, events, request } = createHarness();

  const result = await commands.logActivity({
    request,
    semesterId,
    opportunityId,
    activityKind: "note",
    occurredAt,
    updatedAt,
    summary: "Introduced by the program director",
  });

  assert.deepEqual(events, ["authorize", "rpc:log"]);
  assert.deepEqual(authorizations, [{ request, semesterId }]);
  assert.deepEqual(result, {
    ok: true,
    value: {
      id: activityRow.id,
      semesterId,
      opportunityId,
      activityKind: "note",
      channel: null,
      occurredAt,
      summary: "Introduced by the program director",
      actorProfileId: ownerProfileId,
    },
  });
});

test("authorization failure prevents every database RPC", async () => {
  const events: string[] = [];
  const commands = createOutreachCommands(async () => {
    events.push("authorize");
    throw new Error("denied");
  });

  await assert.rejects(
    commands.logActivity({
      request: new Request("https://almaworks.example.test/outreach"),
      semesterId,
      opportunityId,
      activityKind: "note",
      occurredAt,
      updatedAt,
    }),
    /denied/,
  );
  assert.deepEqual(events, ["authorize"]);
});

test("a stale updatedAt becomes a typed conflict instead of an overwrite", async () => {
  const { commands, request } = createHarness({
    snoozeOpportunity: async () => ({
      data: null,
      error: { code: "40001", message: "Outreach opportunity is stale" },
    }),
  });

  const result = await commands.snoozeOpportunity({
    request,
    semesterId,
    opportunityId,
    snoozedUntil: "2027-02-20T12:00:00.000Z",
    updatedAt,
  });

  assert.deepEqual(result, {
    ok: false,
    error: {
      kind: "conflict",
      code: "stale_updated_at",
      message: "Outreach opportunity changed after it was loaded.",
    },
  });
});

test("release authorizes the semester before returning mapped opportunity identifiers", async () => {
  const { commands, events, request } = createHarness();

  const result = await commands.releaseInactiveOwnerWork({
    request,
    semesterId,
    ownerProfileId,
  });

  assert.deepEqual(events, ["authorize", "rpc:release"]);
  assert.deepEqual(result, {
    ok: true,
    value: { opportunityIds: [opportunityId] },
  });
});

test("owner command releases ownership without validating a replacement owner", async () => {
  const events: string[] = [];
  const client = createFakeClient(events, {
    transferOwner: async (args) => {
      events.push("rpc:transfer");
      assert.equal(args.p_new_owner_profile_id, null);
      return successful({ ...opportunityRow, owner_profile_id: null });
    },
  });
  const commands = createOutreachCommands(async () => {
    events.push("authorize");
    return client;
  });

  const result = await commands.transferOwner({
    request: new Request("https://almaworks.example.test/outreach"),
    semesterId,
    opportunityId,
    newOwnerProfileId: null,
    reason: "Owner left the team",
    updatedAt,
  });

  assert.deepEqual(events, ["authorize", "rpc:transfer"]);
  assert.equal(result.ok && result.value.ownerProfileId, null);
});

test("snooze command clears an existing snooze with a null timestamp", async () => {
  const events: string[] = [];
  const client = createFakeClient(events, {
    snoozeOpportunity: async (args) => {
      events.push("rpc:snooze");
      assert.equal(args.p_snoozed_until, null);
      return successful({ ...opportunityRow, snoozed_until: null });
    },
  });
  const commands = createOutreachCommands(async () => {
    events.push("authorize");
    return client;
  });

  const result = await commands.snoozeOpportunity({
    request: new Request("https://almaworks.example.test/outreach"),
    semesterId,
    opportunityId,
    snoozedUntil: null,
    updatedAt,
  });

  assert.deepEqual(events, ["authorize", "rpc:snooze"]);
  assert.equal(result.ok && result.value.snoozedUntil, null);
});

test("membership suspension authorizes before its single atomic offboarding RPC", async () => {
  const events: string[] = [];
  const request = new Request("https://almaworks.example.test/memberships/suspend");
  const rpcClient: MembershipSuspensionRpcClient = {
    suspendOutreachMembership: async (args) => {
      events.push("rpc:suspend");
      assert.deepEqual(args, {
        p_expected_updated_at: updatedAt,
        p_profile_id: ownerProfileId,
        p_reason: "Program role ended",
        p_semester_id: semesterId,
      });
      return successful([{
        membership_id: "30000000-0000-0000-0000-000000000001",
        membership_status: "suspended",
        membership_updated_at: occurredAt,
        released_opportunity_ids: [opportunityId],
      }]);
    },
  };
  const authorize: AuthorizeMembershipSuspension = async (
    authorizedRequest,
    authorizedSemesterId,
  ) => {
    events.push("authorize");
    assert.equal(authorizedRequest, request);
    assert.equal(authorizedSemesterId, semesterId);
    return rpcClient;
  };
  const suspendMembership = createSuspendOutreachMembershipCommand(authorize);

  const result = await suspendMembership({
    request,
    semesterId,
    profileId: ownerProfileId,
    reason: "  Program role ended  ",
    updatedAt,
  });

  assert.deepEqual(events, ["authorize", "rpc:suspend"]);
  assert.deepEqual(result, {
    ok: true,
    value: {
      membershipId: "30000000-0000-0000-0000-000000000001",
      membershipStatus: "suspended",
      membershipUpdatedAt: occurredAt,
      releasedOpportunityIds: [opportunityId],
    },
  });
});

test("membership suspension returns a typed conflict for stale state", async () => {
  const rpcClient: MembershipSuspensionRpcClient = {
    suspendOutreachMembership: async () => ({
      data: null,
      error: { code: "40001", message: "Semester membership is stale" },
    }),
  };
  const suspendMembership = createSuspendOutreachMembershipCommand(async () => rpcClient);

  const result = await suspendMembership({
    request: new Request("https://almaworks.example.test/memberships/suspend"),
    semesterId,
    profileId: ownerProfileId,
    reason: "Program role ended",
    updatedAt,
  });

  assert.deepEqual(result, {
    ok: false,
    error: {
      kind: "conflict",
      code: "stale_updated_at",
      message: "Semester membership changed after it was loaded.",
    },
  });
});

test("membership suspension propagates atomic RPC failure without a follow-up mutation", async () => {
  const events: string[] = [];
  const rpcClient: MembershipSuspensionRpcClient = {
    suspendOutreachMembership: async () => {
      events.push("rpc:suspend");
      return {
        data: null,
        error: { code: "P0001", message: "forced owner release activity failure" },
      };
    },
  };
  const suspendMembership = createSuspendOutreachMembershipCommand(async () => {
    events.push("authorize");
    return rpcClient;
  });

  await assert.rejects(
    suspendMembership({
      request: new Request("https://almaworks.example.test/memberships/suspend"),
      semesterId,
      profileId: ownerProfileId,
      reason: "Program role ended",
      updatedAt,
    }),
    /forced owner release activity failure/,
  );
  assert.deepEqual(events, ["authorize", "rpc:suspend"]);
});
