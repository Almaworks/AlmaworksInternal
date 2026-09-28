import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/db/types.ts";
import { createMentorBookingStore } from "../../src/mentor-booking/server.ts";

const semesterId = "11111111-1111-4111-8111-111111111111";
const mentorSemesterId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const viewer = { profileId: "profile", role: "mentor" as const, mentorSemesterId, startupSemesterId: null };
const request = { action: "request_booking" as const, semesterId, mentorSemesterId, startsAt: "2026-10-01T13:00:00Z", endsAt: "2026-10-01T13:15:00Z", topic: "Product" };

test("request and pending acceptance refresh Calendar before the actual RLS mutation", async () => {
  for (const command of [request, { action: "accept_request" as const, semesterId, requestId }]) {
    const order: string[] = [];
    const client = createClient<Database>("https://layjdjfvxkowxidwuvbs.supabase.co", "test", {
      auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("mentor_booking_requests")) return Response.json({ mentor_semester_id: mentorSemesterId, status: "pending" });
        order.push("write"); return Response.json(requestId);
      } },
    });
    const store = createMentorBookingStore(client, viewer, undefined, "participant-token", async (target) => {
      assert.equal(target.mentorSemesterId, mentorSemesterId); assert.equal(target.semesterId, semesterId);
      assert.equal(target.token, "participant-token"); order.push("refresh");
    });
    await store.execute(command);
    assert.deepEqual(order, ["refresh", "write"]);
  }
});

test("a failed Calendar refresh prevents request mutation", async () => {
  let writes = 0;
  const client = createClient<Database>("https://layjdjfvxkowxidwuvbs.supabase.co", "test", {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async () => { writes++; return Response.json(requestId); } },
  });
  const store = createMentorBookingStore(client, viewer, undefined, "participant-token", async () => { throw new Error("refresh failed"); });
  await assert.rejects(store.execute(request), /refresh failed/);
  assert.equal(writes, 0);
});

test("acceptance retry, decline and cancellation do not depend on Google availability", async () => {
  for (const action of ["accept_request", "decline_request", "cancel_request"] as const) {
    let refreshes = 0, writes = 0;
    const client = createClient<Database>("https://layjdjfvxkowxidwuvbs.supabase.co", "test", {
      auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input) => {
        if (new URL(String(input)).pathname.endsWith("mentor_booking_requests")) return Response.json({ mentor_semester_id: mentorSemesterId, status: "accepted" });
        writes++; return Response.json(requestId);
      } },
    });
    const store = createMentorBookingStore(client, viewer, undefined, "participant-token", async () => { refreshes++; throw new Error("Google unavailable"); });
    await store.execute({ action, semesterId, requestId });
    assert.equal(refreshes, 0); assert.equal(writes, 1);
  }
});
