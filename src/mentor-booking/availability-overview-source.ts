export type AvailabilityOverviewRange = {
  endsAt: string;
  startsAt: string;
  weekday: number;
};

type WorkspaceAvailabilityRange = AvailabilityOverviewRange & {
  mentor: { profileId: string };
};

export function availabilityOverviewSource(
  dashboardAvailability: readonly AvailabilityOverviewRange[],
  workspaceAvailability: readonly WorkspaceAvailabilityRange[],
  profileId: string,
): AvailabilityOverviewRange[] {
  if (dashboardAvailability.length > 0) return [...dashboardAvailability];
  return workspaceAvailability
    .filter((range) => range.mentor.profileId === profileId)
    .map(({ weekday, startsAt, endsAt }) => ({ weekday, startsAt, endsAt }));
}
