export type AvailabilitySlot = 1 | 2;
export type AvailabilityFormat = "in_person" | "remote" | "hybrid";

export type AvailabilityWindowRow = {
  format?: AvailabilityFormat | null;
  is_available: boolean;
  meeting_id: string;
  slot: AvailabilitySlot;
};

export function normalizeAvailabilityFormat(value: string | null | undefined): AvailabilityFormat {
  switch (value?.trim().toLowerCase().replace(/[ -]+/gu, "_")) {
    case "in_person":
    case "inperson":
      return "in_person";
    case "remote":
    case "online":
    case "virtual":
      return "remote";
    case "hybrid":
    case "either":
    case "both":
      return "hybrid";
    default:
      return "hybrid";
  }
}

export function availabilityFormatCompatible(availabilityFormat: AvailabilityFormat, sessionFormat: string | null | undefined): boolean {
  const bookedFormat = normalizeAvailabilityFormat(sessionFormat);
  return availabilityFormat === "hybrid" || bookedFormat === "hybrid" || availabilityFormat === bookedFormat;
}

export function availabilityWindowKey(meetingId: string, slot: AvailabilitySlot) {
  return `${meetingId}:${slot}`;
}

export function availabilityStateFromRows(rows: readonly AvailabilityWindowRow[]) {
  return Object.fromEntries(rows.map((row) => [
    availabilityWindowKey(row.meeting_id, row.slot),
    row.is_available,
  ]));
}

export function availabilityRowsForMeetings(input: {
  meetingIds: readonly string[];
  membershipId: string;
  semesterId: string;
  state: Readonly<Record<string, boolean | { isAvailable: boolean; format: AvailabilityFormat }>>;
}) {
  return input.meetingIds.flatMap((meetingId) => ([1, 2] as const).map((slot) => {
    const value = input.state[availabilityWindowKey(meetingId, slot)];
    return {
      semester_id: input.semesterId,
      semester_membership_id: input.membershipId,
      meeting_id: meetingId,
      slot,
      is_available: typeof value === "object" ? value.isAvailable : value ?? false,
      format: typeof value === "object" ? value.format : null,
      source: "user",
    };
  }));
}
