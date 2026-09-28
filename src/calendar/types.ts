/** Absolute intervals are half-open: startsAt inclusive, endsAt exclusive. */
export interface CalendarInterval { startsAt: string; endsAt: string }
export interface CalendarWorkingHours { weekday: number; startsAt: string; endsAt: string }
export interface CalendarOverride extends CalendarInterval { available: boolean }
export interface CalendarBusySnapshot extends CalendarInterval {
  fetchedAt: string;
  busy: readonly CalendarInterval[];
}
export type CalendarAvailabilityMode = "weekly" | "synced" | "manual";
export interface AvailabilityInput {
  mode: CalendarAvailabilityMode;
  timeZone: string;
  programTimeZone: string;
  semesterStartDate: string;
  semesterEndDate: string;
  range: CalendarInterval;
  now: string;
  workingHours: readonly CalendarWorkingHours[];
  snapshot: CalendarBusySnapshot | null;
  /** Reconnect required, revoked credentials, or last refresh failed. */
  syncUnavailable?: boolean;
  manualSlots: readonly CalendarInterval[];
  overrides: readonly CalendarOverride[];
  acceptedBookings: readonly CalendarInterval[];
}
/** Safe for all roles: no Google event or credential data. */
export interface EffectiveAvailability {
  slots: CalendarInterval[];
  status: "ready" | "partial_coverage" | "sync_required";
}
