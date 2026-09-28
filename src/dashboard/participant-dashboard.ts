import type { StartupDirectoryProfile } from "./participant-startups.ts";
import type { StartupStage } from "../program/startup-stage.ts";

export type ParticipantRole = "mentor" | "startup";
export type ParticipantMembershipStatus = "invited" | "onboarding" | "active" | "alumni" | "suspended";

export interface ParticipantNotification {
  id: string;
  semesterId: string;
  recipientProfileIds: string[];
  startupSemesterId: string | null;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

export interface ParticipantNetworkEntry {
  id: string;
  semesterId: string;
  kind: ParticipantRole;
  name: string;
  headline: string;
  tags: string[];
  summary: string;
}

export interface ParticipantDashboardSource {
  notifications: ParticipantNotification[];
  network: ParticipantNetworkEntry[];
}

export interface ActivationState {
  emailVerified: boolean;
  profileComplete: boolean;
  semesterActive: boolean;
  roleSetupComplete: boolean;
}

export interface ActivationStep {
  id: string;
  status: "complete" | "current" | "locked";
}

export function scopeParticipantDashboard(input: {
  role: ParticipantRole;
  profileId: string;
  startupSemesterId: string | null;
  activeSemesterId: string;
  source: ParticipantDashboardSource;
}) {
  const { role, profileId, startupSemesterId, activeSemesterId, source } = input;
  return {
    notifications: source.notifications
      .filter((notification) => (
        notification.semesterId === activeSemesterId
        && (
          notification.recipientProfileIds.includes(profileId)
          || (role === "startup" && startupSemesterId !== null && notification.startupSemesterId === startupSemesterId)
        )
      ))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    network: source.network.filter((entry) => (
      entry.semesterId === activeSemesterId
      && (role === "startup" || entry.kind === "startup")
    )),
  };
}

export function buildActivationSteps(role: ParticipantRole, state: ActivationState): ActivationStep[] {
  const definitions = [
    { id: "email", complete: state.emailVerified },
    { id: "profile", complete: state.profileComplete },
    { id: "semester", complete: state.semesterActive },
    ...(role === "startup" ? [{ id: "mentor-needs", complete: state.roleSetupComplete }] : []),
  ];
  const firstIncomplete = definitions.findIndex((step) => !step.complete);
  return definitions.map((step, index) => ({
    id: step.id,
    status: step.complete ? "complete" : index === firstIncomplete ? "current" : "locked",
  }));
}

export interface ParticipantMembershipInput {
  id: string;
  semesterId: string;
  profileId: string;
  role: ParticipantRole | "admin";
  status: ParticipantMembershipStatus;
}

export type ParticipantContext =
  | { kind: "unavailable" }
  | { kind: "pending"; semesterId: string; semesterName: string }
  | {
      kind: "participant";
      semesterId: string;
      semesterName: string;
      membershipId: string;
      role: ParticipantRole;
      status: ParticipantMembershipStatus;
    };

export function selectParticipantContext(input: {
  activeSemester: { id: string; name: string } | null;
  memberships: ParticipantMembershipInput[];
}): ParticipantContext {
  if (!input.activeSemester) return { kind: "unavailable" };
  const eligibleMemberships = input.memberships.filter((candidate) => (
    candidate.semesterId === input.activeSemester?.id
    && (candidate.role === "mentor" || candidate.role === "startup")
    && candidate.status !== "alumni"
    && candidate.status !== "suspended"
  ));
  // A person can belong to a startup and mentor in the same semester. The participant
  // dashboard is mentor-first so their own availability is never hidden by row order.
  const membership = eligibleMemberships.find((candidate) => candidate.role === "mentor")
    ?? eligibleMemberships.find((candidate) => candidate.role === "startup");
  if (!membership) {
    return { kind: "pending", semesterId: input.activeSemester.id, semesterName: input.activeSemester.name };
  }
  return {
    kind: "participant",
    semesterId: input.activeSemester.id,
    semesterName: input.activeSemester.name,
    membershipId: membership.id,
    role: membership.role as ParticipantRole,
    status: membership.status,
  };
}

export interface ParticipantMentorNeedsSummary {
  needs: string[];
  context: string | null;
  noPreference: boolean;
}

export interface ParticipantBookingNotification {
  durationMinutes?: number;
  requestId: string;
  status: "accepted" | "cancelled" | "declined" | "pending";
  counterpartName: string;
  topic: string;
  createdAt: string;
}

export interface ParticipantDirectoryEntry extends ParticipantNetworkEntry {
  websiteUrl: string | null;
  photoUrl: string | null;
  email?: string | null;
  linkedinUrl?: string | null;
}

export interface ParticipantDashboardView {
  state: "participant";
  role: ParticipantRole;
  membershipStatus: ParticipantMembershipStatus;
  semester: { id: string; name: string };
  startupSemesterId: string | null;
  weeklyAvailability: { endsAt: string; startsAt: string; weekday: number }[];
  upcomingMeetings: { counterpartName: string; endsAt: string; startsAt: string; topic: string }[];
  identity: { profileId: string; fullName: string; email: string; emailVerified: boolean; photoUrl: string | null };
  activation: ActivationStep[];
  network: ParticipantDirectoryEntry[];
  startups: StartupDirectoryProfile[];
  notifications: Array<{
    id: string;
    key: string;
    kind: "activation" | "session";
    title: string;
    body: string;
    createdAt: string;
    read: boolean;
    destination: "bookings" | "mentor-needs" | "profile";
  }>;
  profile: {
    company?: string;
    headline: string;
    summary: string;
    tags: string[];
    websiteUrl: string;
    linkedinUrl: string;
  };
  startupProfile?: {
    name: string;
    industry: string;
    stage: StartupStage;
    description: string;
    websiteUrl: string;
  } | null;
  mentorNeeds: ParticipantMentorNeedsSummary | null;
}

export interface StartupProfileForm {
  name: string;
  industry: string;
  stage: StartupStage;
  description: string;
  websiteUrl: string;
}

export function unreadNotificationCount(view: Pick<ParticipantDashboardView, "notifications">): number {
  return view.notifications.filter((notification) => !notification.read).length;
}

export function markParticipantNotificationRead(
  view: ParticipantDashboardView,
  notificationKey: string,
): ParticipantDashboardView {
  return {
    ...view,
    notifications: view.notifications.map((notification) => (
      notification.key === notificationKey ? { ...notification, read: true } : notification
    )),
  };
}

export function buildParticipantDashboard(input: {
  now: string;
  context: Extract<ParticipantContext, { kind: "participant" }>;
  identity: ParticipantDashboardView["identity"];
  startupSemesterId: string | null;
  mentorSemesterId: string | null;
  weeklyAvailability?: { endsAt: string; startsAt: string; weekday: number }[];
  upcomingMeetings?: { counterpartName: string; endsAt: string; startsAt: string; topic: string }[];
  profileComplete: boolean;
  roleSetupComplete: boolean;
  network: ParticipantDirectoryEntry[];
  startups?: StartupDirectoryProfile[];
  profile?: ParticipantDashboardView["profile"];
  startupProfile?: ParticipantDashboardView["startupProfile"];
  mentorNeeds?: ParticipantMentorNeedsSummary | null;
  bookingNotifications?: ParticipantBookingNotification[];
  readNotificationKeys?: string[];
}): ParticipantDashboardView {
  const activation = buildActivationSteps(input.context.role, {
    emailVerified: input.identity.emailVerified,
    profileComplete: input.profileComplete,
    semesterActive: input.context.status === "active",
    roleSetupComplete: input.roleSetupComplete,
  });
  const network = input.network.filter((entry) => (
    entry.semesterId === input.context.semesterId
    && (input.context.role === "startup" || entry.kind === "startup")
  ));
  const notifications: ParticipantDashboardView["notifications"] = [];
  const readNotificationKeys = new Set(input.readNotificationKeys ?? []);
  const currentStep = activation.find((step) => step.status === "current");
  if (currentStep) {
    const key = `activation-${currentStep.id}`;
    notifications.push({
      id: `activation-${currentStep.id}`,
      key,
      kind: "activation",
      title: currentStep.id === "semester" ? "Activation is pending" : "Continue account setup",
      body: currentStep.id === "semester"
        ? "Your setup is ready for an Almaworks administrator to activate."
        : "Complete the next activation step to get ready for scheduling.",
      createdAt: input.now,
      read: readNotificationKeys.has(key),
      destination: currentStep.id === "mentor-needs" ? "mentor-needs" : "profile",
    });
  }
  for (const booking of input.bookingNotifications ?? []) {
    const notificationStatus = input.context.role === "mentor" ? "pending" : booking.status;
    const key = `mentor-booking-${booking.requestId}-${notificationStatus}`;
    const topic = booking.topic.trim() ? ` about ${booking.topic.trim()}` : "";
    const duration = booking.durationMinutes === 15 || booking.durationMinutes === 30 ? `${booking.durationMinutes}-minute ` : "";
    const copy = notificationStatus === "pending"
      ? { title: "New meeting request", body: `${booking.counterpartName} requested a ${duration}meeting${topic}.` }
      : notificationStatus === "accepted"
        ? { title: "Meeting request accepted", body: `${booking.counterpartName} accepted your meeting request${topic}.` }
        : { title: "Meeting request declined", body: `${booking.counterpartName} declined your meeting request${topic}.` };
    notifications.push({
      id: key,
      key,
      kind: "session",
      title: copy.title,
      body: copy.body,
      createdAt: booking.createdAt,
      read: readNotificationKeys.has(key),
      destination: "bookings",
    });
  }
  notifications.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return {
    state: "participant",
    role: input.context.role,
    membershipStatus: input.context.status,
    semester: { id: input.context.semesterId, name: input.context.semesterName },
    startupSemesterId: input.context.role === "startup" ? input.startupSemesterId : null,
    weeklyAvailability: input.context.role === "mentor" ? input.weeklyAvailability ?? [] : [],
    upcomingMeetings: input.upcomingMeetings ?? [],
    identity: input.identity,
    activation,
    network,
    startups: input.context.role === "mentor" ? (input.startups ?? []).filter((startup) => startup.semesterId === input.context.semesterId) : [],
    notifications,
    profile: input.profile ?? { headline: "", summary: "", tags: [], websiteUrl: "", linkedinUrl: "" },
    startupProfile: input.startupProfile ?? null,
    mentorNeeds: input.context.role === "startup" ? input.mentorNeeds ?? { needs: [], context: null, noPreference: false } : null,
  };
}

function clean(value: string): string {
  return value.trim();
}

function tagsFrom(value: string): string[] {
  const seen = new Set<string>();
  return value.split(",").map(clean).filter((tag) => {
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildProfileUpdate(role: ParticipantRole, input: {
  company?: string;
  fullName: string;
  headline: string;
  summary: string;
  tags: string;
  websiteUrl: string;
  linkedinUrl: string;
}) {
  const profile = { full_name: clean(input.fullName) };
  if (role === "mentor") {
    return {
      profile,
      mentorProfile: {
        ...(input.company === undefined ? {} : { company: clean(input.company) }),
        title: clean(input.headline),
        biography: clean(input.summary),
        expertise_tags: tagsFrom(input.tags),
        website_url: clean(input.websiteUrl),
        linkedin_url: clean(input.linkedinUrl),
      },
    };
  }
  return {
    profile,
    startupSemester: {
      company_snapshot: clean(input.summary),
      mentor_need_context: clean(input.headline),
    },
  };
}

export function buildStartupProfileUpdate(input: StartupProfileForm) {
  return {
    organization: {
      name: clean(input.name),
      industry: clean(input.industry),
      description: clean(input.description),
      website_url: clean(input.websiteUrl),
    },
    startupSemester: { stage: input.stage },
  };
}
