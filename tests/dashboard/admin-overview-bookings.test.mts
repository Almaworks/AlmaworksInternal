import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

import { loadAdminOverview } from "../../src/dashboard/admin-overview.ts";

test("overview names Friday sessions separately and links pending mentorship bookings to bookings", () => {
  const page = readFileSync(resolve(import.meta.dirname, "../../app/dashboard/admin/page.tsx"), "utf8");
  assert.match(page, /label: 'Friday sessions'/u);
  assert.match(page, /Friday sessions awaiting confirmation/u);
  assert.match(page, /label: 'Mentorship bookings'/u);
  assert.match(page, /href="\/dashboard\/bookings"/u);
  assert.match(page, /Mentorship bookings pending/u);
});

test("overview keeps Friday sessions and semester-scoped mentorship bookings as separate totals", async () => {
  const urls: URL[] = [];
  const client = createClient("https://example.supabase.co", "test-key", {
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        urls.push(url);
        const data = url.pathname.endsWith("/startup_semesters")
          ? [{ mentorship_needs: ["Product"] }]
          : url.pathname.endsWith("/mentor_semesters")
            ? [{ id: "mentor-semester-a" }]
            : url.pathname.endsWith("/sessions")
              ? [{ status: "confirmed" }, { status: "requested" }]
              : url.pathname.endsWith("/mentor_booking_requests")
                ? [{ status: "accepted" }, { status: "pending" }, { status: "declined" }]
                : [];
        return new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json", "Content-Range": "0-0/1" },
        });
      },
    },
  });

  assert.deepEqual(await loadAdminOverview(client, "semester-a"), {
    startups: 1,
    openNeeds: 1,
    mentors: 1,
    confirmedSessions: 1,
    unconfirmedSessions: 1,
    acceptedMentorshipBookings: 1,
    pendingMentorshipBookings: 1,
  });

  const bookingRead = urls.find((url) => url.pathname.endsWith("/mentor_booking_requests"));
  assert.ok(bookingRead, "the booking total must read mentor_booking_requests");
  assert.equal(bookingRead.searchParams.get("semester_id"), "eq.semester-a");
});
