export type AvailabilitySlot = 1 | 2;

export type AvailabilityWindowRow = {
  is_available: boolean;
  meeting_id: string;
  slot: AvailabilitySlot;
};

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
  state: Readonly<Record<string, boolean>>;
}) {
  return input.meetingIds.flatMap((meetingId) => ([1, 2] as const).map((slot) => ({
    semester_id: input.semesterId,
    semester_membership_id: input.membershipId,
    meeting_id: meetingId,
    slot,
    is_available: input.state[availabilityWindowKey(meetingId, slot)] ?? false,
    source: "user",
  })));
}
