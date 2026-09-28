export type ParticipantWeeklyAvailability = {
  endsAt: string;
  startsAt: string;
  weekday: number;
};

function firstRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return firstRecord(value[0]);
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function weeklyAvailabilityForProfile(
  rows: readonly unknown[],
  profileId: string,
): ParticipantWeeklyAvailability[] {
  return rows.flatMap((row) => {
    const range = firstRecord(row);
    const mentorSemester = firstRecord(range?.mentor_semesters);
    const membership = firstRecord(mentorSemester?.semester_memberships);
    const weekday = range?.weekday;
    const startsAt = text(range?.starts_at);
    const endsAt = text(range?.ends_at);
    if (
      membership?.profile_id !== profileId
      || typeof weekday !== "number"
      || startsAt === null
      || endsAt === null
    ) return [];
    return [{ weekday, startsAt, endsAt }];
  });
}
