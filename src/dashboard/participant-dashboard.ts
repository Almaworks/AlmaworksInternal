import { canChangeSessionRsvp, sessionStartIso, type SessionAttendeeRsvp, type SessionRsvpState } from "../sessions/rsvp.ts";

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

export interface ParticipantSession {
  id: string;
  semesterId: string;
  mentorProfileId: string;
  startupSemesterId: string;
  partnerName: string;
  date: string;
  topic: string;
  format: string;
  status: "confirmed" | "completed" | "cancelled";
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
  sessions: ParticipantSession[];
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
    sessions: source.sessions.filter((session) => (
      session.semesterId === activeSemesterId
      && (role === "mentor" ? session.mentorProfileId === profileId : session.startupSemesterId === startupSemesterId)
    )),
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
    { id: role === "mentor" ? "availability" : "mentor-needs", complete: state.roleSetupComplete },
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
  const membership = input.memberships.find((candidate) => (
    candidate.semesterId === input.activeSemester?.id
    && (candidate.role === "mentor" || candidate.role === "startup")
    && candidate.status !== "alumni"
    && candidate.status !== "suspended"
  ));
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

export interface ParticipantSessionInput {
  id: string;
  semesterId: string;
  mentorSemesterId: string;
  startupSemesterId: string;
  partnerName: string;
  meetingDate: string;
  startsAt: string;
  endsAt: string;
  timezone?: string | null;
  topic: string | null;
  format: string | null;
  status: string;
  attendees?: SessionAttendeeRsvp[];
}

export interface ParticipantMentorNeedsSummary {
  needs: string[];
  context: string | null;
  noPreference: boolean;
}

export interface ParticipantSessionView extends ParticipantSessionInput {
  timing: "upcoming" | "past";
  sessionStartsAt: string;
  rsvpOpen: boolean;
  ownRsvp: SessionRsvpState;
  attendees: SessionAttendeeRsvp[];
}

export interface ParticipantDirectoryEntry extends ParticipantNetworkEntry {
  websiteUrl: string | null;
  photoUrl: string | null;
  email?: string | null;
  linkedinUrl?: string | null;
}

export interface ParticipantAvailabilityWindow {
  meetingId: string;
  meetingDate: string;
  slot: 1 | 2;
  startsAt: string;
  endsAt: string;
  timezone: string | null;
  isAvailable: boolean;
  format: "in_person" | "remote" | "hybrid";
  confirmedSession: { id: string; startup: string; topic: string | null; format: string | null } | null;
}

export interface ParticipantDashboardView {
  state: "participant";
  role: ParticipantRole;
  membershipStatus: ParticipantMembershipStatus;
  semester: { id: string; name: string };
  identity: { profileId: string; fullName: string; email: string; emailVerified: boolean };
  activation: ActivationStep[];
  sessions: ParticipantSessionView[];
  network: ParticipantDirectoryEntry[];
  notifications: Array<{
    id: string;
    key: string;
    kind: "activation" | "session";
    title: string;
    body: string;
    createdAt: string;
    read: boolean;
    destination: "sessions" | "availability" | "mentor-needs" | "profile";
  }>;
  profile: {
    headline: string;
    summary: string;
    tags: string[];
    websiteUrl: string;
    linkedinUrl: string;
  };
  mentorNeeds: ParticipantMentorNeedsSummary | null;
  availability: ParticipantAvailabilityWindow[];
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
  profileComplete: boolean;
  roleSetupComplete: boolean;
  sessions: ParticipantSessionInput[];
  network: ParticipantDirectoryEntry[];
  profile?: ParticipantDashboardView["profile"];
  mentorNeeds?: ParticipantMentorNeedsSummary | null;
  availability?: ParticipantAvailabilityWindow[];
  readNotificationKeys?: string[];
}): ParticipantDashboardView {
  const activation = buildActivationSteps(input.context.role, {
    emailVerified: input.identity.emailVerified,
    profileComplete: input.profileComplete,
    semesterActive: input.context.status === "active",
    roleSetupComplete: input.roleSetupComplete,
  });
  const now = Date.parse(input.now);
  const sessions = input.sessions
    .filter((session) => (
      session.semesterId === input.context.semesterId
      && (input.context.role === "mentor"
        ? session.mentorSemesterId === input.mentorSemesterId
        : session.startupSemesterId === input.startupSemesterId)
    ))
    .map((session): ParticipantSessionView => {
      const sessionStartsAt = sessionStartIso({ meetingDate: session.meetingDate, startsAt: session.startsAt, timezone: session.timezone });
      const attendees = session.attendees ?? [];
      return {
        ...session,
        attendees,
        sessionStartsAt,
        timing: Date.parse(sessionStartsAt) <= now ? "past" : "upcoming",
        rsvpOpen: canChangeSessionRsvp({ now: input.now, sessionStartsAt, status: session.status }),
        ownRsvp: attendees.find((attendee) => attendee.semesterMembershipId === input.context.membershipId)?.response ?? "no_response",
      };
    })
    .sort((left, right) => left.meetingDate.localeCompare(right.meetingDate));
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
      destination: currentStep.id === "availability" ? "availability" : currentStep.id === "mentor-needs" ? "mentor-needs" : "profile",
    });
  }
  for (const session of sessions.filter((candidate) => candidate.status === "confirmed")) {
    const key = `session-${session.id}-${session.status}`;
    notifications.push({
      id: `session-${session.id}`,
      key,
      kind: "session",
      title: session.timing === "upcoming" ? "Session confirmed" : "Session completed",
      body: `${session.partnerName} · ${session.meetingDate}`,
      createdAt: `${session.meetingDate}T00:00:00Z`,
      read: readNotificationKeys.has(key),
      destination: "sessions",
    });
  }
  notifications.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return {
    state: "participant",
    role: input.context.role,
    membershipStatus: input.context.status,
    semester: { id: input.context.semesterId, name: input.context.semesterName },
    identity: input.identity,
    activation,
    sessions,
    network,
    notifications,
    profile: input.profile ?? { headline: "", summary: "", tags: [], websiteUrl: "", linkedinUrl: "" },
    mentorNeeds: input.context.role === "startup" ? input.mentorNeeds ?? { needs: [], context: null, noPreference: false } : null,
    availability: input.context.role === "mentor" ? input.availability ?? [] : [],
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
