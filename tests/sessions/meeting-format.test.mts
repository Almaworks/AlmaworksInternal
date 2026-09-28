import assert from "node:assert/strict";
import test from "node:test";
import { validateSessionMeetingFormat, sessionFormatSource } from "../../src/sessions/meeting-format.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/db/types.ts";

test("retired Friday slot preferences require no database lookup", async () => {
  const client = { from() { throw new Error("Retired relation must not be queried"); } } as unknown as SupabaseClient<Database>;
  assert.equal(await sessionFormatSource(client).slotFormat(input, "membership"), null);
});

const input = { semesterId: "semester", meetingId: "meeting", mentorSemesterId: "mentor", slot: 2 as const, format: "online" };
function source(preferredFormat: string | null, slotFormat: string | null) {
  return {
    mentor: async () => ({ membershipId: "membership", preferredFormat }),
    slotFormat: async () => slotFormat,
  };
}
test("session writes accept Either and exact preferences for both concrete formats", async () => {
  for (const format of ["online", "in_person"]) {
    for (const preference of ["hybrid", format]) {
      assert.equal(await validateSessionMeetingFormat({ ...input, format }, source(preference, null)), format);
    }
  }
});
test("session writes reject ambiguous meeting formats", async () => {
  for (const format of ["hybrid", "either", null, ""]) {
    await assert.rejects(validateSessionMeetingFormat({ ...input, format }, source("hybrid", null)), /Online or In Person/);
  }
});
test("session writes reject incompatible mentors and honor the selected slot preference", async () => {
  await assert.rejects(validateSessionMeetingFormat(input, source("in_person", null)), /does not support/);
  await assert.rejects(validateSessionMeetingFormat(input, source("hybrid", "in_person")), /does not support/);
  assert.equal(await validateSessionMeetingFormat(input, source("in_person", "remote")), "online");
  assert.equal(await validateSessionMeetingFormat(input, source("in_person", "hybrid")), "online");
});
test("session writes reject mentors outside the semester", async () => {
  await assert.rejects(validateSessionMeetingFormat(input, { mentor: async () => null, slotFormat: async () => null }), /not available/);
});
