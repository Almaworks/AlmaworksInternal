import assert from "node:assert/strict";
import test from "node:test";

import { buildStartupCalendar, isMentorHighlighted, rankAvailableMentors } from "../../src/mentor-booking/startup-calendar.ts";

const slot = (mentorSemesterId: string, name: string, expertiseTags: string[]) => ({
  mentorSemesterId,
  mentor: { profileId: mentorSemesterId, name, expertiseTags },
  startsAt: "2026-10-05T15:00:00.000Z",
  endsAt: "2026-10-05T15:15:00.000Z",
});

test("groups mentors available during the same calendar time into one selectable cell", () => {
  const calendar = buildStartupCalendar({ slots: [slot("ada", "Ada", ["Fundraising"]), slot("beau", "Beau", ["Sales"])], timeZone: "America/New_York" });
  assert.equal(calendar.cells.length, 1);
  assert.deepEqual(calendar.cells[0]?.mentors.map((mentor) => mentor.name), ["Ada", "Beau"]);
});

test("keeps every calendar cell visible while identifying a searched mentor's slots", () => {
  const calendar = buildStartupCalendar({ slots: [slot("ada", "Ada", ["Fundraising"]), { ...slot("beau", "Beau", ["Sales"]), startsAt: "2026-10-05T15:15:00.000Z", endsAt: "2026-10-05T15:30:00.000Z" }], timeZone: "America/New_York" });
  assert.equal(calendar.cells.length, 2);
  assert.equal(isMentorHighlighted(calendar.cells[0]!, "ada"), true);
  assert.equal(isMentorHighlighted(calendar.cells[1]!, "ada"), false);
});

test("ranks available mentors by startup-need expertise overlap then alphabetically", () => {
  const ranked = rankAvailableMentors({ mentors: [slot("beau", "Beau", ["Sales"]).mentor, slot("ada", "Ada", ["Fundraising", "Sales"]).mentor, slot("cy", "Cy", ["Fundraising"]).mentor], startupNeeds: ["fundraising", "sales"] });
  assert.deepEqual(ranked.map((mentor) => [mentor.name, mentor.matchCount]), [["Ada", 2], ["Beau", 1], ["Cy", 1]]);
});
