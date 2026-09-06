import {
  buildParticipantDashboard,
  type ParticipantDashboardView,
  type ParticipantDirectoryEntry,
  type ParticipantRole,
  type ParticipantSessionInput,
} from "./participant-dashboard.ts";

export type AdminView = "admin" | ParticipantRole;

export function adminViewDestination(view: AdminView): string {
  if (view === "admin") return "/dashboard/admin";
  return `/dashboard/admin/preview/${view}`;
}

export function shouldShowAdminViewLoading(
  pathname: string,
  destination: AdminView | null,
): boolean {
  return destination !== null && pathname !== adminViewDestination(destination);
}

export function resolveAdminViewTransition(
  pathname: string,
  destination: AdminView | null,
  isPending: boolean,
): {
  loading: boolean;
  selectedView: AdminView;
  sidebarView: "admin";
  sidebarInteractive: boolean;
} {
  const loading = isPending && shouldShowAdminViewLoading(pathname, destination);
  return {
    loading,
    selectedView: loading && destination ? destination : "admin",
    sidebarView: "admin",
    sidebarInteractive: !loading,
  };
}

export function parseParticipantPreviewRole(value: string): ParticipantRole | null {
  return value === "mentor" || value === "startup" ? value : null;
}

function dateOffset(now: string, days: number): string {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const network: ParticipantDirectoryEntry[] = [
  { id: "demo-mentor-maya", semesterId: "demo-semester", kind: "mentor", name: "Maya Chen", headline: "VP Revenue · Helio", tags: ["Enterprise sales", "Go-to-market", "Hiring"], summary: "Helps early teams build repeatable revenue systems and land their first enterprise customers.", websiteUrl: "helio.demo", photoUrl: null },
  { id: "demo-mentor-jordan", semesterId: "demo-semester", kind: "mentor", name: "Jordan Ellis", headline: "Founder · Fieldwork", tags: ["Fundraising", "Pricing", "Product"], summary: "Former founder and operator focused on positioning, pricing, and fundraising narratives.", websiteUrl: "fieldwork.demo", photoUrl: null },
  { id: "demo-mentor-amara", semesterId: "demo-semester", kind: "mentor", name: "Amara Okafor", headline: "COO · Current Labs", tags: ["Operations", "Leadership", "Scaling"], summary: "Partners with founders on operating cadence, team design, and scaling through inflection points.", websiteUrl: "currentlabs.demo", photoUrl: null },
  { id: "demo-startup-northstar", semesterId: "demo-semester", kind: "startup", name: "Northstar Labs", headline: "Climate intelligence · Seed", tags: ["Climate", "B2B SaaS", "Data"], summary: "Decision tools that help industrial teams forecast and manage climate-related operational risk.", websiteUrl: "northstar.demo", photoUrl: null },
  { id: "demo-startup-luma", semesterId: "demo-semester", kind: "startup", name: "Luma Health", headline: "Care navigation · Pre-seed", tags: ["Healthtech", "Marketplace", "Consumer"], summary: "A guided care platform that helps families understand options and find trusted providers faster.", websiteUrl: "luma.demo", photoUrl: null },
  { id: "demo-startup-forge", semesterId: "demo-semester", kind: "startup", name: "Forge Robotics", headline: "Warehouse automation · Seed", tags: ["Robotics", "Hardware", "Logistics"], summary: "Modular robotic systems that make warehouse automation accessible to mid-market operators.", websiteUrl: "forge.demo", photoUrl: null },
];

export function buildParticipantPreview(
  role: ParticipantRole,
  now = new Date().toISOString(),
): ParticipantDashboardView {
  const isMentor = role === "mentor";
  const mentorSemesterId = "demo-mentor-semester-maya";
  const startupSemesterId = "demo-startup-semester-northstar";
  const sessions: ParticipantSessionInput[] = [
    {
      id: "demo-upcoming-session",
      semesterId: "demo-semester",
      mentorSemesterId,
      startupSemesterId,
      partnerName: isMentor ? "Northstar Labs" : "Maya Chen",
      meetingDate: dateOffset(now, 10),
      startsAt: "15:30",
      endsAt: "16:15",
      timezone: "America/New_York",
      topic: "Enterprise sales motion",
      format: "In person",
      status: "confirmed",
      attendees: [
        { semesterMembershipId: "demo-mentor-membership", profileId: "demo-profile-maya", fullName: "Maya Chen", role: "mentor", response: "attending", respondedAt: now, updatedAt: now },
        { semesterMembershipId: "demo-startup-membership", profileId: "demo-profile-nadia", fullName: "Nadia Rahman", role: "startup", response: "no_response", respondedAt: null, updatedAt: null },
        { semesterMembershipId: "demo-startup-teammate", profileId: "demo-profile-eli", fullName: "Eli Brooks", role: "startup", response: "attending", respondedAt: now, updatedAt: now },
      ],
    },
    {
      id: "demo-later-session",
      semesterId: "demo-semester",
      mentorSemesterId,
      startupSemesterId,
      partnerName: isMentor ? "Northstar Labs" : "Maya Chen",
      meetingDate: dateOffset(now, 17),
      startsAt: "16:15",
      endsAt: "17:00",
      timezone: "America/New_York",
      topic: "Pilot pipeline review",
      format: "Online",
      status: "confirmed",
      attendees: [
        { semesterMembershipId: "demo-mentor-membership", profileId: "demo-profile-maya", fullName: "Maya Chen", role: "mentor", response: "no_response", respondedAt: null, updatedAt: null },
        { semesterMembershipId: "demo-startup-membership", profileId: "demo-profile-nadia", fullName: "Nadia Rahman", role: "startup", response: "attending", respondedAt: now, updatedAt: now },
        { semesterMembershipId: "demo-startup-teammate", profileId: "demo-profile-eli", fullName: "Eli Brooks", role: "startup", response: "not_attending", respondedAt: now, updatedAt: now },
      ],
    },
    {
      id: "demo-past-session",
      semesterId: "demo-semester",
      mentorSemesterId,
      startupSemesterId,
      partnerName: isMentor ? "Forge Robotics" : "Jordan Ellis",
      meetingDate: dateOffset(now, -7),
      startsAt: "13:00",
      endsAt: "13:45",
      timezone: "America/New_York",
      topic: isMentor ? "First sales hire" : "Pricing strategy",
      format: "Online",
      status: "completed",
      attendees: [
        { semesterMembershipId: "demo-mentor-membership", profileId: "demo-profile-maya", fullName: "Maya Chen", role: "mentor", response: "attending", respondedAt: now, updatedAt: now },
        { semesterMembershipId: "demo-startup-membership", profileId: "demo-profile-nadia", fullName: "Nadia Rahman", role: "startup", response: "attending", respondedAt: now, updatedAt: now },
      ],
    },
  ];

  return buildParticipantDashboard({
    now,
    context: {
      kind: "participant",
      semesterId: "demo-semester",
      semesterName: "Demo Semester",
      membershipId: isMentor ? "demo-mentor-membership" : "demo-startup-membership",
      role,
      status: "active",
    },
    identity: isMentor
      ? { profileId: "demo-profile-maya", fullName: "Maya Chen", email: "maya@helio.demo", emailVerified: true }
      : { profileId: "demo-profile-nadia", fullName: "Nadia Rahman", email: "nadia@northstar.demo", emailVerified: true },
    startupSemesterId: isMentor ? null : startupSemesterId,
    mentorSemesterId: isMentor ? mentorSemesterId : null,
    profileComplete: true,
    roleSetupComplete: true,
    sessions,
    network,
    mentorNeeds: isMentor ? null : { needs: ["Enterprise sales", "Pricing"], context: "We are preparing for our first enterprise pilot and need help tightening the buying process.", noPreference: false },
    profile: isMentor
      ? { headline: "VP Revenue · Helio", summary: "I help early teams build repeatable enterprise sales systems.", tags: ["Enterprise sales", "Go-to-market", "Hiring"], websiteUrl: "https://helio.demo", linkedinUrl: "https://linkedin.com/in/maya-demo" }
      : { headline: "Climate intelligence · Seed", summary: "Northstar helps industrial teams forecast climate-related operational risk.", tags: ["Enterprise sales", "Pricing", "Fundraising"], websiteUrl: "https://northstar.demo", linkedinUrl: "https://linkedin.com/in/nadia-demo" },
  });
}
