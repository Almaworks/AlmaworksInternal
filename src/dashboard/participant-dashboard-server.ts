import {
  buildParticipantDashboard,
  buildProfileUpdate,
  selectParticipantContext,
  type ParticipantBookingNotification,
  type ParticipantDashboardView,
  type ParticipantDirectoryEntry,
  type ParticipantMembershipInput,
} from "./participant-dashboard.ts";

export interface ParticipantDashboardSnapshot {
  activeSemester: { id: string; name: string } | null;
  memberships: ParticipantMembershipInput[];
  identity: ParticipantDashboardView["identity"];
  startupSemesterId: string | null;
  mentorSemesterId: string | null;
  weeklyAvailability?: { endsAt: string; startsAt: string; weekday: number }[];
  upcomingMeetings?: { counterpartName: string; endsAt: string; startsAt: string; topic: string }[];
  profileComplete: boolean;
  roleSetupComplete: boolean;
  network: ParticipantDirectoryEntry[];
  startups?: ParticipantDashboardView["startups"];
  profile?: ParticipantDashboardView["profile"];
  startupProfile?: ParticipantDashboardView["startupProfile"];
  mentorNeeds?: ParticipantDashboardView["mentorNeeds"];
  bookingNotifications?: ParticipantBookingNotification[];
  readNotificationKeys?: string[];
}

export type ParticipantDashboardResponse =
  | ParticipantDashboardView
  | { state: "pending"; semester: { id: string; name: string } }
  | { state: "unavailable" };

export interface ParticipantProfileForm {
  company?: string;
  fullName: string;
  headline: string;
  summary: string;
  tags: string;
  websiteUrl: string;
  linkedinUrl: string;
}

export interface ParticipantDashboardRepository {
  load(profileId: string): Promise<ParticipantDashboardSnapshot>;
  updateProfile(
    profileId: string,
    context: Extract<ReturnType<typeof selectParticipantContext>, { kind: "participant" }>,
    payload: ReturnType<typeof buildProfileUpdate>,
  ): Promise<void>;
}

export function createParticipantDashboardService(
  repository: ParticipantDashboardRepository,
  now: () => string = () => new Date().toISOString(),
) {
  async function load(profileId: string): Promise<ParticipantDashboardResponse> {
    const snapshot = await repository.load(profileId);
    const context = selectParticipantContext(snapshot);
    if (context.kind === "unavailable") return { state: "unavailable" };
    if (context.kind === "pending") {
      return { state: "pending", semester: { id: context.semesterId, name: context.semesterName } };
    }
    return buildParticipantDashboard({ ...snapshot, context, now: now() });
  }

  async function update(profileId: string, form: ParticipantProfileForm): Promise<void> {
    const snapshot = await repository.load(profileId);
    const context = selectParticipantContext(snapshot);
    if (context.kind !== "participant") throw new Error("An active-semester participant membership is required.");
    await repository.updateProfile(profileId, context, buildProfileUpdate(context.role, form));
  }

  return { load, update };
}
