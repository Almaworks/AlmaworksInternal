import assert from "node:assert/strict";
import test from "node:test";
import { parseCalendarSettings, parseCalendarOverride } from "../../src/calendar/settings-input.ts";
const input = { mode: "synced", timeZone: "America/New_York", connectionId: "00000000-0000-4000-8000-000000000001", workingHours: [{ weekday: 1, startsAt: "09:00", endsAt: "12:00" }] };
test("settings accepts ordered quarter-hour ranges and ignores client-supplied identity", () => {
  assert.deepEqual(parseCalendarSettings({ ...input, profileId: "attacker", mentorSemesterId: "other" }), input);
});
test("settings rejects overlaps, invalid zones, unaligned times and missing sync connection", () => {
  for (const value of [ { ...input, timeZone: "Mars/Olympus" }, { ...input, connectionId: null }, { ...input, mode: "manual" }, { ...input, workingHours: [{weekday:1,startsAt:"09:01",endsAt:"10:00"}] }, { ...input, workingHours: [...input.workingHours,{weekday:1,startsAt:"11:00",endsAt:"13:00"}] }]) assert.throws(() => parseCalendarSettings(value));
  assert.equal(parseCalendarSettings({ mode:"weekly",timeZone:"UTC",workingHours:[],connectionId:null }).workingHours.length, 0);
});
test("individual overrides allow reset but reject arbitrary intervals and past dates", () => {
  const now = Date.parse("2026-09-19T12:00:00Z");
  const slot = { startsAt: "2026-09-20T12:00:00Z", endsAt: "2026-09-20T12:15:00Z", available: null };
  assert.deepEqual(parseCalendarOverride(slot, now), slot);
  for (const value of [{...slot,endsAt:"2026-09-20T12:30:00Z"},{...slot,available:"true"},{...slot,startsAt:"2026-09-19T11:00:00Z"},{...slot,startsAt:"2026-09-20T12:00:00"}]) assert.throws(() => parseCalendarOverride(value, now));
});
