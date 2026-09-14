import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const layout = readFileSync(resolve(import.meta.dirname, "../../app/dashboard/layout.tsx"), "utf8");
const page = readFileSync(resolve(import.meta.dirname, "../../app/dashboard/bookings/page.tsx"), "utf8");

test("mentor and startup navigation opens the shared booking page", () => {
  const entries = [...layout.matchAll(/href: '\/dashboard\/bookings', label: 'Bookings'/gu)];
  assert.equal(entries.length, 2);
});

test("the shared booking page renders the workspace without a participant redirect", () => {
  assert.match(page, /<MentorBookingWorkspace/u);
  assert.doesNotMatch(page, /router\.replace|participant-dashboard/u);
});
