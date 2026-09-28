"use client";

import { CalendarDays } from "lucide-react";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

import styles from "@/app/design-preview/participant-dashboard/participant-dashboard.module.css";
import { authenticatedFetch } from "@/src/auth/authenticated-fetch";
import { availabilityOverviewCalendar, hasAvailabilityOverview } from "@/src/mentor-booking/availability-overview";
import { availabilityOverviewSource, type AvailabilityOverviewRange } from "@/src/mentor-booking/availability-overview-source";
import { calendarBlocksFromWeeklyAvailability } from "@/src/mentor-booking/weekly-availability-grid";
import { isMentorBookingResponse } from "./presentation";

type Props = {
  availability: readonly AvailabilityOverviewRange[];
  profileId: string;
  semesterId: string;
  onManage: () => void;
};

export default function MentorAvailabilityOverview({ availability, profileId, semesterId, onManage }: Props) {
  const [workspaceAvailability, setWorkspaceAvailability] = useState<AvailabilityOverviewRange[]>([]);
  useEffect(() => {
    if (availability.length > 0) return;
    let active = true;
    void (async () => {
      try {
        const response = await authenticatedFetch(`/api/mentor-booking?semesterId=${encodeURIComponent(semesterId)}`);
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok || !isMentorBookingResponse(payload) || payload.semesterId !== semesterId || !active) return;
        setWorkspaceAvailability(availabilityOverviewSource([], payload.availability ?? [], profileId));
      } catch { /* The dashboard's empty state remains available if the fallback request fails. */ }
    })();
    return () => { active = false; };
  }, [availability, profileId, semesterId]);
  const visibleAvailability = availabilityOverviewSource(availability, workspaceAvailability.map((range) => ({ ...range, mentor: { profileId } })), profileId);
  const blocks = calendarBlocksFromWeeklyAvailability(
    visibleAvailability.map((range) => ({ ...range, mentorSemesterId: "dashboard-mentor" })),
    "dashboard-mentor",
  );
  const days = availabilityOverviewCalendar(blocks);
  return <div className={styles.availabilityOverview} aria-label="Your weekly availability, read only">
    <div className={styles.availabilityOverviewIntro}><CalendarDays size={19} /><p>Current weekly schedule</p><button type="button" onClick={onManage}>View</button></div>
    {hasAvailabilityOverview(blocks) ? <>
      <div className={styles.availabilityCalendarScroll}>
        <div className={styles.availabilityCalendar} role="group" aria-label="Weekly availability calendar">
          <div className={styles.availabilityTimeHeading}>Time</div>
          {days.map((day) => <h3 key={`${day.day}-heading`}>{day.label}</h3>)}
          <div className={styles.availabilityTimeAxis} aria-hidden="true"><span>8 AM</span><span>12 PM</span><span>5 PM</span><span>9 PM</span></div>
          {days.map((day) => <section key={day.day} className={styles.availabilityDayLane} aria-label={`${day.label} availability`}>
            {day.ranges.map((range) => <span
              key={`${range.startSlot}-${range.spanSlots}`}
              className={styles.availabilityBlock}
              style={{ "--availability-start": range.startSlot + 1, "--availability-span": range.spanSlots } as CSSProperties}
              aria-label={`${day.label}, ${range.label}`}
              title={`${day.label}, ${range.label}`}
              tabIndex={0}
            />)}
          </section>)}
        </div>
      </div>
      <div className={styles.availabilityLegend}><span><i /> Available</span><small>Repeats weekly</small></div>
    </> : <div className={styles.availabilityEmpty}><CalendarDays size={20} /><p>No program hours have been assigned yet.</p><button type="button" onClick={onManage}>View schedule</button></div>}
  </div>;
}
