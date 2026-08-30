import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  normalizeLegacyActivity,
  normalizeLegacyOutreachMetadata,
} from "../../src/outreach/legacy-migration.ts";
import { commitLegacyMigration } from "../../src/outreach/legacy-service.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/db/types.ts";

const semesterId = "4403d7a5-1ff5-4be9-b96c-323893c9ac68";
const importId = "5357e744-bcf6-49ab-9379-48d5efcbb0af";

test("preserves an unknown legacy action as a CRM note with its original payload", () => {
  assert.deepEqual(normalizeLegacyActivity({
    id: "activity-1",
    action_type: "handwritten_follow_up",
    detail: { topic: "warm introduction", count: 2 },
    created_at: "2026-03-01T10:00:00.000Z",
    admin_id: "actor-1",
  }), {
    kind: "note",
    channel: null,
    occurredAt: "2026-03-01T10:00:00.000Z",
    actorProfileId: "actor-1",
    summary: "Legacy activity: handwritten_follow_up",
    details: {
      legacy: {
        id: "activity-1",
        actionType: "handwritten_follow_up",
        detail: { topic: "warm introduction", count: 2 },
      },
    },
  });
});

test("maps a legacy note_added activity to a CRM note while retaining provenance", () => {
  const activity = normalizeLegacyActivity({
    id: "activity-2", action_type: "note_added", detail: { text: "Call after demo" },
    created_at: "2026-03-03T10:00:00.000Z", admin_id: "actor-2",
  });
  assert.equal(activity.kind, "note");
  assert.equal(activity.summary, "Call after demo");
  assert.deepEqual(activity.details.legacy, {
    id: "activity-2", actionType: "note_added", detail: { text: "Call after demo" },
  });
});

test("maps known legacy statuses and source context without losing unsupported values", () => {
  assert.deepEqual(normalizeLegacyOutreachMetadata({
    id: "outreach-1",
    notes: "Follow up after demo",
    source_channel: "Warm Intro",
    referred_by: "Ada",
    expertise_tags: ["AI", "B2B"],
    converted_mentor_id: "mentor-1",
    last_contacted_at: "2026-03-02T10:00:00.000Z",
  }), {
    notes: "Follow up after demo",
    sourceChannel: "warm_intro",
    referredBy: "Ada",
    expertiseTags: ["AI", "B2B"],
    conversionDetails: { legacyConvertedMentorId: "mentor-1", legacyOutreachId: "outreach-1" },
    lastContactedAt: "2026-03-02T10:00:00.000Z",
    issues: [],
  });
});

test("records unsupported legacy source channels for review while retaining their source value", () => {
  const metadata = normalizeLegacyOutreachMetadata({
    id: "outreach-2",
    source_channel: "Carrier pigeon",
  });

  assert.equal(metadata.sourceChannel, null);
  assert.deepEqual(metadata.issues, ["source_channel_invalid"]);
  assert.deepEqual(metadata.conversionDetails, {
    legacyOutreachId: "outreach-2",
    legacySourceChannel: "Carrier pigeon",
  });
});

test("legacy commit delegates every mutation to one authenticated atomic RPC", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return {
        data: {
          importId,
          status: "committed",
          summary: { committedRows: 2 },
        },
        error: null,
      };
    },
  } as unknown as SupabaseClient<Database>;

  const result = await commitLegacyMigration({
    client,
    userId: "041e14c4-fcbf-4ec9-a125-86116b6a87de",
    semesterId,
    idempotencyKey: "legacy-commit-1",
  });

  assert.deepEqual(calls, [{
    name: "commit_legacy_outreach_migration",
    args: {
      p_semester_id: semesterId,
      p_idempotency_key: "legacy-commit-1",
    },
  }]);
  assert.deepEqual(result, {
    importId,
    status: "committed",
    summary: { committedRows: 2 },
  });
});

test("legacy commit surfaces database idempotency conflicts without follow-up writes", async () => {
  let calls = 0;
  const client = {
    rpc: async () => {
      calls += 1;
      return {
        data: null,
        error: {
          code: "23505",
          message: "Legacy migration preview is already bound to another idempotency key",
        },
      };
    },
  } as unknown as SupabaseClient<Database>;

  await assert.rejects(
    commitLegacyMigration({
      client,
      userId: "041e14c4-fcbf-4ec9-a125-86116b6a87de",
      semesterId,
      idempotencyKey: "conflicting-key",
    }),
    /already bound to another idempotency key/i,
  );
  assert.equal(calls, 1);
});

test("legacy commit route passes the authenticated RLS client to the atomic service", () => {
  const route = readFileSync(
    new URL(
      "../../app/api/admin/outreach/migrations/legacy/commit/route.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(route, /requireSemesterAdmin\(request, body\.semesterId\)/);
  assert.match(route, /client: context\.userClient/);
  assert.doesNotMatch(route, /service[_-]?role|adminClient/iu);
});
