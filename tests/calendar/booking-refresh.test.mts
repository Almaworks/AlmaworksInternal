import assert from "node:assert/strict";
import test from "node:test";
import { refreshCalendarBeforeBooking, refreshCalendarForBooking } from "../../src/calendar/booking-refresh.ts";
import { encryptRefreshToken } from "../../src/calendar/token-crypto.ts";

test("weekly/manual or freshly checked bookings need no worker configuration", async () => {
  let refreshes = 0;
  await refreshCalendarBeforeBooking({ required: async () => false, refresh: async () => { refreshes++; return true; } });
  assert.equal(refreshes, 0);
});

test("stale synced bookings wait for a published refresh", async () => {
  const order: string[] = [];
  await refreshCalendarBeforeBooking({ required: async () => { order.push("check"); return true; }, refresh: async () => { order.push("refresh"); return true; } });
  assert.deepEqual(order, ["check", "refresh"]);
});

test("failed or superseded refresh prevents the booking action", async () => {
  for (const refresh of [async () => false, async () => { throw new Error("private provider failure"); }]) {
    await assert.rejects(refreshCalendarBeforeBooking({ required: async () => true, refresh }),
      (error: Error) => /Calendar availability/.test(error.message) && !/private provider/.test(error.message));
  }
});

test("malformed freshness status fails closed instead of bypassing refresh", async () => {
  await assert.rejects(refreshCalendarBeforeBooking({ required: async () => null, refresh: async () => true }));
});

test("booking refresh uses participant authorization, a targeted worker lease and fenced publication", async (context) => {
  const encryptionKey = Buffer.alloc(32, 7);
  const settings = {
    CALENDAR_AVAILABILITY_ENABLED: "true", CALENDAR_APP_ORIGIN: "http://localhost:3000",
    GOOGLE_CALENDAR_CLIENT_ID: "fixture-client", GOOGLE_CALENDAR_CLIENT_SECRET: "fixture-secret",
    GOOGLE_CALENDAR_ENCRYPTION_KEY: encryptionKey.toString("base64"),
    CALENDAR_WORKER_EMAIL: "worker@example.test", CALENDAR_WORKER_PASSWORD: "fixture-password",
    CALENDAR_CRON_SECRET: "x".repeat(32), NEXT_PUBLIC_SUPABASE_URL: "https://layjdjfvxkowxidwuvbs.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-public",
  };
  for (const [name, value] of Object.entries(settings)) {
    const previous = process.env[name]; process.env[name] = value;
    context.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
  }
  const encrypted = JSON.stringify(encryptRefreshToken("provider-access", encryptionKey, { profileId: "profile", connectionId: "connection" }));
  const busy = { start: new Date(Date.now()+3600000).toISOString(), end: new Date(Date.now()+7200000).toISOString() };
  for (const publishSuccess of [true, false]) {
    const order: string[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const request = new Request(input, init), url = new URL(request.url), body = await request.json();
      const name = url.pathname.split("/").at(-1)!; order.push(name);
      if (url.origin === "https://www.googleapis.com") {
        assert.equal(name, "freeBusy"); assert.equal(request.headers.get("authorization"), "Bearer provider-access");
        return Response.json({ kind: "calendar#freeBusy", timeMin: body.timeMin, timeMax: body.timeMax, calendars: { primary: { busy: [busy] } } });
      }
      assert.equal(url.origin, settings.NEXT_PUBLIC_SUPABASE_URL);
      if (name === "calendar_booking_refresh_required") {
        assert.equal(request.headers.get("authorization"), "Bearer participant");
        assert.deepEqual(body, { p_semester_id: "semester", p_mentor_semester_id: "mentor" });
        return Response.json(true);
      }
      if (name === "token") return Response.json({ access_token: "worker", token_type: "bearer" });
      assert.equal(request.headers.get("authorization"), "Bearer worker");
      if (name === "calendar_lease_booking_sync") return Response.json([{
        job_id: "job", lease_token: "lease", credential_generation: 7, profile_id: "profile", connection_id: "connection",
        calendar_id: "primary", refresh_token_ciphertext: encrypted, access_token_ciphertext: encrypted,
        access_expires_at: new Date(Date.now() + 3600000).toISOString(),
      }]);
      assert.equal(name, "calendar_apply_sync_result");
      assert.equal(body.p_lease_token, "lease"); assert.equal(body.p_credential_generation, 7);
      assert.deepEqual(body.p_busy, [{starts_at:busy.start,ends_at:busy.end}]); return Response.json(publishSuccess);
    };
    const operation = refreshCalendarForBooking({ token: "participant", semesterId: "semester", mentorSemesterId: "mentor", fetch: fetcher });
    if (publishSuccess) await operation; else await assert.rejects(operation, /could not be refreshed/);
    assert.deepEqual(order, ["calendar_booking_refresh_required", "token", "calendar_lease_booking_sync", "freeBusy", "calendar_apply_sync_result"]);
  }
});
