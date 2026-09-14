import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mentorBookingSchema = (await readFile(
  new URL("../../supabase/schemas/mentor_booking.sql", import.meta.url),
  "utf8",
)).toLowerCase();
const canonicalSchema = (await readFile(
  new URL("../../supabase/schemas/canonical_schema.sql", import.meta.url),
  "utf8",
)).toLowerCase();
const securitySchema = (await readFile(
  new URL("../../supabase/schemas/zz_security.sql", import.meta.url),
  "utf8",
)).toLowerCase();

test("booking window publication does not reserve Friday time for the retired mentor program", () => {
  assert.doesNotMatch(mentorBookingSchema, /friday program|published on fridays/u);
});

test("the canonical schema retains the legacy assignment function without authenticated execute permission", () => {
  assert.match(canonicalSchema, /create or replace function "public"\."commit_mentor_assignment"/u);
  assert.match(canonicalSchema, /revoke all on function "public"\."commit_mentor_assignment"[\s\S]*?from "authenticated"/u);
  assert.doesNotMatch(canonicalSchema, /grant all on function "public"\."commit_mentor_assignment"[\s\S]*?to "authenticated"/u);
  assert.match(securitySchema, /revoke insert \([^)]*\) on table public\.sessions from authenticated/u);
  assert.match(securitySchema, /revoke all on function public\.commit_mentor_assignment\([^)]*\) from authenticated/u);
  assert.doesNotMatch(securitySchema, /grant execute on function public\.commit_mentor_assignment\([^)]*\) to authenticated/u);
});
