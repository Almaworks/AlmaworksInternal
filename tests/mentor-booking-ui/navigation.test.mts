import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const layout = readFileSync(resolve(import.meta.dirname, "../../app/dashboard/layout.tsx"), "utf8");
const page = readFileSync(resolve(import.meta.dirname, "../../app/dashboard/bookings/page.tsx"), "utf8");

test("mentor and startup navigation each expose their booking workspace", () => {
  for (const role of ["mentor", "startup"]) {
    const navigation = new RegExp(`effectiveRole === '${role}'\\s*\\?\\s*\\[([^\\]]+)\\]`, "u").exec(layout)?.[1];
    assert.ok(navigation, `Missing ${role} navigation`);
    const destination = new RegExp(`href: '/dashboard/(?:bookings|${role}\\?tab=bookings)', label: 'Bookings'`, "u");
    assert.match(navigation, destination);
  }
});

test("the shared booking page renders the workspace without a participant redirect", () => {
  assert.match(page, /<MentorBookingWorkspace/u);
  assert.doesNotMatch(page, /router\.replace|participant-dashboard/u);
});
