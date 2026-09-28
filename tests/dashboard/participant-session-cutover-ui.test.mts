import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("participant navigation separates availability or bookings from the Friday Program", async () => {
  const source = await readFile("app/dashboard/participant/ParticipantDashboard.tsx", "utf8");

  assert.match(source, /id: "availability" as const, label: "Availability"/u);
  assert.match(source, /id: "bookings" as const, label: "Bookings"/u);
  assert.doesNotMatch(source, /item\.id !== "friday-program" \|\| !isMentor/u);
  assert.match(source, /tab === "bookings"[\s\S]*?<MentorBookingWorkspace/u);
  assert.match(source, /tab === "friday-program"[\s\S]*?<FridayProgramPanel/u);
  assert.doesNotMatch(source, /ParticipantSessionCard|respondToSession|session-rsvps|tab === "sessions"/u);
});
