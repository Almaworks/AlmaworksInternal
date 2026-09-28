import assert from "node:assert/strict";
import test from "node:test";

test("composes adjacent database timestamps regardless of equivalent UTC formatting", () => {
  const mentor = { profileId: "qa-profile", name: "QA mentor" };
  const slots = startupBookingSlots({
    availability: [],
    effectiveAvailability: [
      { mentorSemesterId: "qa-mentor", mentor, startsAt: "2026-10-05T13:30:00+00:00", endsAt: "2026-10-05T13:45:00+00:00" },
      { mentorSemesterId: "qa-mentor", mentor, startsAt: "2026-10-05T13:45:00+00:00", endsAt: "2026-10-05T14:00:00+00:00" },
    ],
    semesterStartDate: "2026-10-02", semesterEndDate: "2026-11-20",
    now: new Date("2026-10-04T12:00:00Z"), timeZone: "America/New_York", durationMinutes: 30,
  });
  assert.equal(slots.length, 1);
  assert.equal(Date.parse(slots[0]!.endsAt) - Date.parse(slots[0]!.startsAt), 1800000);
});

import * as startupAvailability from "../../src/mentor-booking/startup-availability.ts";

const { startupBookingSlots } = startupAvailability;

test("derives the real Sunday-to-Saturday calendar week in the program timezone", () => {
  const currentCalendarWeek = (startupAvailability as Record<string, unknown>)["currentCalendarWeek"];

  assert.equal(typeof currentCalendarWeek, "function");
  if (typeof currentCalendarWeek !== "function") return;

  const current = currentCalendarWeek(new Date("2026-09-14T02:30:00.000Z"), "America/New_York", 0) as {
    dates: string[];
    endDate: string;
    label: string;
    startDate: string;
  };
  const next = currentCalendarWeek(new Date("2026-09-14T02:30:00.000Z"), "America/New_York", 1) as typeof current;

  assert.deepEqual(current, {
    dates: ["2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19"],
    endDate: "2026-09-19",
    label: "Sep 13 - 19, 2026",
    startDate: "2026-09-13",
  });
  assert.equal(next.startDate, "2026-09-20");
  assert.equal(next.endDate, "2026-09-26");
});

test("projects Layth's weekly Monday range into future requestable 15-minute appointments", () => {
  const slots = startupBookingSlots({
    availability: [{
      mentorSemesterId: "layth-fall-2026",
      mentor: { profileId: "layth", name: "Layth Rahman" },
      weekday: 1,
      startsAt: "11:15:00",
      endsAt: "12:00:00",
    }],
    semesterEndDate: "2026-12-20",
    semesterStartDate: "2026-09-01",
    timeZone: "America/New_York",
    now: new Date("2026-10-04T16:00:00.000Z"),
    durationMinutes: 15,
  });

  assert.deepEqual(slots.slice(0, 3).map((slot) => [slot.mentor.name, slot.startsAt, slot.endsAt]), [
    ["Layth Rahman", "2026-10-05T15:15:00.000Z", "2026-10-05T15:30:00.000Z"],
    ["Layth Rahman", "2026-10-05T15:30:00.000Z", "2026-10-05T15:45:00.000Z"],
    ["Layth Rahman", "2026-10-05T15:45:00.000Z", "2026-10-05T16:00:00.000Z"],
  ]);
});

test("starts with the first cohort week when the semester has not begun", () => {
  const slots = startupBookingSlots({
    availability: [{
      mentorSemesterId: "mentor-1",
      mentor: { profileId: "profile-1", name: "Future Mentor" },
      weekday: 5,
      startsAt: "09:00:00",
      endsAt: "10:00:00",
    }],
    semesterStartDate: "2026-10-02",
    semesterEndDate: "2026-11-20",
    timeZone: "America/New_York",
    now: new Date("2026-09-26T16:00:00.000Z"),
  });

  assert.equal(slots[0]?.startsAt, "2026-10-02T13:00:00.000Z");
});

test("defaults to 30 minutes and offers only contiguous intervals", () => {
  const base = {
    availability: [{
      mentorSemesterId: "mentor-1",
      mentor: { profileId: "profile-1", name: "Mentor" },
      weekday: 1,
      startsAt: "09:30:00",
      endsAt: "10:15:00",
    }],
    semesterStartDate: "2026-10-05",
    semesterEndDate: "2026-10-05",
    timeZone: "America/New_York",
    now: new Date("2026-10-04T16:00:00.000Z"),
  } as const;

  assert.deepEqual(startupBookingSlots(base).map(slot => [slot.startsAt, slot.endsAt]), [
    ["2026-10-05T13:30:00.000Z", "2026-10-05T14:00:00.000Z"],
    ["2026-10-05T13:45:00.000Z", "2026-10-05T14:15:00.000Z"],
  ]);
  assert.deepEqual(startupBookingSlots({ ...base, durationMinutes: 15 }).map(slot => slot.startsAt), [
    "2026-10-05T13:30:00.000Z",
    "2026-10-05T13:45:00.000Z",
    "2026-10-05T14:00:00.000Z",
  ]);
});

test("does not bridge a busy quarter-hour into a 30-minute booking", () => {
  const slots = startupBookingSlots({
    effectiveAvailability: [
      { mentorSemesterId: "mentor-1", mentor: { profileId: "profile-1", name: "Mentor" }, startsAt: "2026-10-05T13:30:00.000Z", endsAt: "2026-10-05T13:45:00.000Z" },
      { mentorSemesterId: "mentor-1", mentor: { profileId: "profile-1", name: "Mentor" }, startsAt: "2026-10-05T14:00:00.000Z", endsAt: "2026-10-05T14:15:00.000Z" },
    ],
    availability: [],
    semesterStartDate: "2026-10-05",
    semesterEndDate: "2026-10-05",
    timeZone: "America/New_York",
    now: new Date("2026-10-04T16:00:00.000Z"),
  });

  assert.deepEqual(slots, []);
});

test("projects requestable startup times for a later real-world week", () => {
  const slots = startupBookingSlots({
    availability: [{
      mentorSemesterId: "layth-fall-2026",
      mentor: { profileId: "layth", name: "Layth Rahman" },
      weekday: 1,
      startsAt: "11:15:00",
      endsAt: "11:30:00",
    }],
    semesterEndDate: "2026-10-26",
    semesterStartDate: "2026-09-01",
    timeZone: "America/New_York",
    now: new Date("2026-10-04T16:00:00.000Z"),
    weekOffset: 3,
    durationMinutes: 15,
  });

  assert.deepEqual(slots.map((slot) => slot.startsAt), ["2026-10-26T15:15:00.000Z"]);
});

test("shows a mentor's broad weekly range without invoking the publishing batch limit", () => {
  assert.doesNotThrow(() => startupBookingSlots({
    availability: [{ mentorSemesterId: "mentor", mentor: { profileId: "mentor", name: "Full Day Mentor" }, weekday: 1, startsAt: "06:00:00", endsAt: "22:00:00" }],
    semesterEndDate: "2026-12-20", semesterStartDate: "2026-09-01", timeZone: "America/New_York", now: new Date("2026-10-04T16:00:00.000Z"),
  }));
});

test("broad availability reuses timezone formatters instead of constructing one per slot boundary", () => {
  const OriginalDateTimeFormat = Intl.DateTimeFormat;
  let constructions = 0;
  const TrackingDateTimeFormat = new Proxy(OriginalDateTimeFormat, {
    construct(target, argumentsList) {
      constructions += 1;
      return Reflect.construct(target, argumentsList);
    },
  });
  Object.defineProperty(Intl, "DateTimeFormat", { configurable: true, value: TrackingDateTimeFormat });
  try {
    const slots = startupBookingSlots({
      availability: [{ mentorSemesterId: "mentor", mentor: { profileId: "mentor", name: "Full Day Mentor" }, weekday: 1, startsAt: "06:00:00", endsAt: "22:00:00" }],
      semesterEndDate: "2026-12-20", semesterStartDate: "2026-09-01", timeZone: "America/New_York", now: new Date("2026-10-04T16:00:00.000Z"),
      durationMinutes: 15,
    });

    assert.equal(slots.length, 64);
    assert.ok(constructions <= 6, `expected at most 6 timezone formatter constructions, received ${constructions}`);
  } finally {
    Object.defineProperty(Intl, "DateTimeFormat", { configurable: true, value: OriginalDateTimeFormat });
  }
});

test("does not offer startup bookings during the Friday 3 PM to 5 PM in-person meeting", () => {
  const slots = startupBookingSlots({
    availability: [{
      mentorSemesterId: "friday-mentor",
      mentor: { profileId: "friday-mentor", name: "Friday Mentor" },
      weekday: 5,
      startsAt: "14:45:00",
      endsAt: "17:15:00",
    }],
    semesterEndDate: "2026-10-09",
    semesterStartDate: "2026-10-09",
    timeZone: "America/New_York",
    now: new Date("2026-10-09T12:00:00.000Z"),
    durationMinutes: 15,
  });

  assert.deepEqual(slots.map((slot) => [slot.startsAt, slot.endsAt]), [
    ["2026-10-09T18:45:00.000Z", "2026-10-09T19:00:00.000Z"],
    ["2026-10-09T21:00:00.000Z", "2026-10-09T21:15:00.000Z"],
  ]);
});

test("removes only the accepted mentor from an occupied startup slot and restores other mentors", () => {
  const slots = startupBookingSlots({
    availability: [
      { mentorSemesterId: "mentor-a", mentor: { profileId: "profile-a", name: "Mentor A" }, weekday: 1, startsAt: "11:00:00", endsAt: "11:30:00" },
      { mentorSemesterId: "mentor-b", mentor: { profileId: "profile-b", name: "Mentor B" }, weekday: 1, startsAt: "11:00:00", endsAt: "11:30:00" },
    ],
    acceptedOccupancy: [{ mentorSemesterId: "mentor-a", startsAt: "2026-10-05T15:00:00.000Z", endsAt: "2026-10-05T15:15:00.000Z" }],
    semesterEndDate: "2026-10-05",
    semesterStartDate: "2026-10-05",
    timeZone: "America/New_York",
    now: new Date("2026-10-04T16:00:00.000Z"),
    durationMinutes: 15,
  });

  assert.deepEqual(slots.map((slot) => [slot.mentorSemesterId, slot.startsAt]), [
    ["mentor-b", "2026-10-05T15:00:00.000Z"],
    ["mentor-a", "2026-10-05T15:15:00.000Z"],
    ["mentor-b", "2026-10-05T15:15:00.000Z"],
  ]);
});

test("ignores occupancy after its meeting interval has ended", () => {
  const slots = startupBookingSlots({
    availability: [{ mentorSemesterId: "mentor-a", mentor: { profileId: "profile-a", name: "Mentor A" }, weekday: 1, startsAt: "11:00:00", endsAt: "11:30:00" }],
    acceptedOccupancy: [{ mentorSemesterId: "mentor-a", startsAt: "2026-10-05T14:30:00.000Z", endsAt: "2026-10-05T15:00:00.000Z" }],
    semesterEndDate: "2026-10-05",
    semesterStartDate: "2026-10-05",
    timeZone: "America/New_York",
    now: new Date("2026-10-05T15:14:00.000Z"),
    durationMinutes: 15,
  });

  assert.deepEqual(slots.map((slot) => slot.startsAt), ["2026-10-05T15:15:00.000Z"]);
});

test("leaves no startup slot when the only mentor is occupied", () => {
  const slots = startupBookingSlots({
    availability: [{ mentorSemesterId: "mentor-a", mentor: { profileId: "profile-a", name: "Mentor A" }, weekday: 1, startsAt: "11:00:00", endsAt: "11:15:00" }],
    acceptedOccupancy: [{ mentorSemesterId: "mentor-a", startsAt: "2026-10-05T15:00:00.000Z", endsAt: "2026-10-05T15:15:00.000Z" }],
    semesterEndDate: "2026-10-05",
    semesterStartDate: "2026-10-05",
    timeZone: "America/New_York",
    now: new Date("2026-10-04T16:00:00.000Z"),
  });

  assert.deepEqual(slots, []);
});
