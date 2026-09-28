import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("participant dashboard owns the bookings workspace", async () => {
  const source = await readFile(new URL("../../app/dashboard/participant/ParticipantDashboard.tsx", import.meta.url), "utf8");

  assert.match(
    source,
    /tab === "bookings"[\s\S]*?<MentorBookingWorkspace semesterId=\{view\.semester\.id\}/u,
  );
});

test("mentor and startup booking actions open the shared bookings tab", async () => {
  const source = await readFile(new URL("../../app/dashboard/participant/ParticipantDashboard.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /open\(isMentor \? "availability" : "bookings"\)/u);
  assert.match(source, /tab === "bookings" && isMentor[\s\S]*?<MentorBookingWorkspace/u);
});
