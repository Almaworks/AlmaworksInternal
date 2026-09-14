import assert from "node:assert/strict";
import test from "node:test";

import { availabilityOverviewCalendar, availabilityOverviewDays } from "../../src/mentor-booking/availability-overview.ts";

test("positions disconnected availability ranges in the compact calendar time grid", () => {
  const [monday] = availabilityOverviewCalendar({
    monday: ["08:00", "08:15", "08:30", "13:45"],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  });

  assert.deepEqual(monday, {
    day: "monday",
    label: "Mon",
    ranges: [
      { label: "8:00–8:45 AM", startSlot: 0, spanSlots: 3 },
      { label: "1:45–2:00 PM", startSlot: 23, spanSlots: 1 },
    ],
  });
});

test("condenses exact fifteen-minute availability blocks into readable weekly calendar ranges", () => {
  const days = availabilityOverviewDays({
    monday: ["09:00", "09:15", "09:30", "13:45"],
    tuesday: [],
    wednesday: ["12:00", "12:15"],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  });

  assert.deepEqual(days, [
    { day: "monday", label: "Mon", ranges: ["9:00–9:45 AM", "1:45–2:00 PM"] },
    { day: "tuesday", label: "Tue", ranges: [] },
    { day: "wednesday", label: "Wed", ranges: ["12:00–12:30 PM"] },
    { day: "thursday", label: "Thu", ranges: [] },
    { day: "friday", label: "Fri", ranges: [] },
    { day: "saturday", label: "Sat", ranges: [] },
    { day: "sunday", label: "Sun", ranges: [] },
  ]);
});

test("keeps midnight and noon ranges unambiguous in the compact overview", () => {
  const [monday] = availabilityOverviewDays({
    monday: ["00:00", "00:15", "12:00"],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  });

  assert.deepEqual(monday?.ranges, ["12:00–12:30 AM", "12:00–12:15 PM"]);
});

test("retains both meridiems when an availability range crosses noon", () => {
  const [monday] = availabilityOverviewDays({
    monday: ["11:45", "12:00"],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  });

  assert.deepEqual(monday?.ranges, ["11:45 AM–12:15 PM"]);
});
