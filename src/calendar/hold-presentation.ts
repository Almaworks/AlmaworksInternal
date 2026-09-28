export type CalendarHoldStatus = "placed" | "queued" | "removing" | "removed" | "conflict" | "reconnect_required" | "failed" | "not_recorded" | "unavailable";

export function calendarHoldStatusText(status:CalendarHoldStatus):string{
  const labels:Record<CalendarHoldStatus,string>={
    placed:"Added to your Google Calendar.",queued:"Your Google Calendar hold is pending.",
    removing:"Removing the hold from your Google Calendar.",removed:"Removed from your Google Calendar.",
    conflict:"Your Google Calendar is busy at this time. The meeting is still booked in Almaworks.",
    reconnect_required:"Reconnect Google Calendar to sync this meeting.",failed:"Your Google Calendar hold could not sync. The meeting status in Almaworks is unchanged.",
    not_recorded:"No Google Calendar hold is recorded for your account.",unavailable:"Your Google Calendar hold status is unavailable. Refresh to check again.",
  };
  return labels[status];
}
