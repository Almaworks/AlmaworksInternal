import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../../components/mentor-booking/StartupAvailabilityBrowser.tsx", import.meta.url), "utf8");

test("renders a time-first calendar with mentor highlighting and an accessible booking dialog", () => {
  assert.match(source, /aria-label="Mentor availability calendar"/u);
  assert.match(source, /Sunday/u);
  assert.match(source, /\{cell\.mentors\.length\} mentor\{cell\.mentors\.length === 1 \? "" : "s"\}/u);
  assert.match(source, /formatAvailabilityTimeLabel/u);
  assert.match(source, /grid-cols-\[5rem_repeat\(7,minmax\(5rem,1fr\)\)\]/u);
  assert.match(source, /min-h-10/u);
  assert.match(source, /Top mentor matches/u);
  assert.match(source, /<details/u);
  assert.match(source, /setMentorQuery\(mentor\.name\)/u);
  assert.match(source, /buildStartupCalendar/u);
  assert.match(source, /isMentorHighlighted/u);
  assert.match(source, /role="dialog"/u);
  assert.match(source, /aria-modal="true"/u);
  assert.match(source, /rankAvailableMentors/u);
  assert.match(source, /Request this time/u);
});

test("starts on the real current week and exposes only forward week navigation with dated day headers", () => {
  assert.match(source, /currentCalendarWeek/u);
  assert.match(source, /Previous week/u);
  assert.match(source, /Next week/u);
  assert.match(source, /weekOffset === 0/u);
  assert.match(source, /weekday: "short"/u);
  assert.match(source, /day: "numeric"/u);
});
