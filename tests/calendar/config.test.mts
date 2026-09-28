import assert from "node:assert/strict";
import test from "node:test";
import { calendarAvailabilityEnabled, calendarConfiguration, calendarSupabaseEnvironment } from "../../src/calendar/config.ts";

const environment = {
  CALENDAR_AVAILABILITY_ENABLED: "true",
  NEXT_PUBLIC_SUPABASE_URL: "https://layjdjfvxkowxidwuvbs.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon",
  CALENDAR_APP_ORIGIN: "http://localhost:3000",
  GOOGLE_CALENDAR_CLIENT_ID: "test-client",
  GOOGLE_CALENDAR_CLIENT_SECRET: "test-secret",
  GOOGLE_CALENDAR_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  CALENDAR_WORKER_EMAIL: "calendar-worker@example.invalid",
  CALENDAR_WORKER_PASSWORD: "test-only-worker-password",
  CALENDAR_CRON_SECRET: "a".repeat(48),
};
test("deployed availability remains enabled when Google or worker secrets are unavailable", () => {
  assert.equal(calendarAvailabilityEnabled({ CALENDAR_AVAILABILITY_ENABLED: "true" }), true);
  assert.equal(calendarAvailabilityEnabled({}), false);
  assert.throws(() => calendarAvailabilityEnabled({ CALENDAR_AVAILABILITY_ENABLED: "invalid" }), /availability/i);
  assert.equal(calendarConfiguration({ ...environment, CALENDAR_AVAILABILITY_ENABLED: "false" }), null);
  assert.equal(calendarConfiguration({ ...environment, CALENDAR_AVAILABILITY_ENABLED: undefined }), null);
});
test("calendar setup stays unavailable when prerequisites are absent", () => {
  assert.equal(calendarConfiguration({}), null);
  assert.equal(calendarConfiguration({ ...environment, GOOGLE_CALENDAR_CLIENT_SECRET: "" }), null);
});
test("configuration binds callback to trusted configured app origin", () => {
  const config = calendarConfiguration(environment)!;
  assert.equal(config.oauth.callbackUrl, "http://localhost:3000/api/calendar/callback");
  assert.equal(config.encryptionKey.length, 32);
  assert.equal(config.appOrigin, "http://localhost:3000");
});
test("another Supabase project fails before a request can be sent", () => {
  assert.throws(() => calendarSupabaseEnvironment({ ...environment, NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" }), /project/i);
  assert.throws(() => calendarConfiguration({ ...environment, NEXT_PUBLIC_SUPABASE_URL: "https://layjdjfvxkowxidwuvbs.supabase.co.evil.invalid" }), /project/i);
});
test("unsafe origins and malformed encryption or cron keys fail closed", () => {
  for (const origin of ["http://production.example", "https://example.com/path", "https://user:password@example.com", "https://example.com?x=1"]) {
    assert.throws(() => calendarConfiguration({ ...environment, CALENDAR_APP_ORIGIN: origin }), /origin/i);
  }
  assert.throws(() => calendarConfiguration({ ...environment, GOOGLE_CALENDAR_ENCRYPTION_KEY: "bad" }), /encryption/i);
  assert.throws(() => calendarConfiguration({ ...environment, CALENDAR_CRON_SECRET: "short" }), /worker/i);
});
