import {
  buildParticipantDashboard,
  type ParticipantDashboardView,
  type ParticipantDirectoryEntry,
  type ParticipantRole,
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

const network: ParticipantDirectoryEntry[] = [
  { id: "demo-mentor-maya", semesterId: "demo-semester", kind: "mentor", name: "Maya Chen", headline: "VP Revenue · Helio", tags: ["Enterprise sales", "Go-to-market", "Hiring"], summary: "Helps early teams build repeatable revenue systems and land their first enterprise customers.", websiteUrl: "helio.demo", photoUrl: null },
  { id: "demo-mentor-jordan", semesterId: "demo-semester", kind: "mentor", name: "Jordan Ellis", headline: "Founder · Fieldwork", tags: ["Fundraising", "Pricing", "Product"], summary: "Former founder and operator focused on positioning, pricing, and fundraising narratives.", websiteUrl: "fieldwork.demo", photoUrl: null },
  { id: "demo-mentor-amara", semesterId: "demo-semester", kind: "mentor", name: "Amara Okafor", headline: "COO · Current Labs", tags: ["Operations", "Leadership", "Scaling"], summary: "Partners with founders on operating cadence, team design, and scaling through inflection points.", websiteUrl: "currentlabs.demo", photoUrl: null },
  { id: "demo-startup-northstar", semesterId: "demo-semester", kind: "startup", name: "Eli Brooks", headline: "Northstar Labs · Climate intelligence · Seed", tags: ["Climate", "B2B SaaS", "Data"], summary: "Decision tools that help industrial teams forecast and manage climate-related operational risk.", websiteUrl: "northstar.demo", photoUrl: null },
  { id: "demo-startup-luma", semesterId: "demo-semester", kind: "startup", name: "Alex Rivera", headline: "Luma Health · Care navigation · Pre-seed", tags: ["Healthtech", "Marketplace", "Consumer"], summary: "A guided care platform that helps families understand options and find trusted providers faster.", websiteUrl: "luma.demo", photoUrl: null },
  { id: "demo-startup-forge", semesterId: "demo-semester", kind: "startup", name: "Sam Patel", headline: "Forge Robotics · Warehouse automation · Seed", tags: ["Robotics", "Hardware", "Logistics"], summary: "Modular robotic systems that make warehouse automation accessible to mid-market operators.", websiteUrl: "forge.demo", photoUrl: null },
];

export function buildParticipantPreview(
  role: ParticipantRole,
  now = new Date().toISOString(),
): ParticipantDashboardView {
  const isMentor = role === "mentor";
  const mentorSemesterId = "demo-mentor-semester-maya";
  const startupSemesterId = "demo-startup-semester-northstar";
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
      ? { profileId: "demo-profile-maya", fullName: "Maya Chen", email: "maya@helio.demo", emailVerified: true, photoUrl: null }
      : { profileId: "demo-profile-nadia", fullName: "Nadia Rahman", email: "nadia@northstar.demo", emailVerified: true, photoUrl: null },
    startupSemesterId: isMentor ? null : startupSemesterId,
    mentorSemesterId: isMentor ? mentorSemesterId : null,
    weeklyAvailability: isMentor ? [{ weekday: 1, startsAt: "09:00", endsAt: "11:00" }, { weekday: 3, startsAt: "14:00", endsAt: "15:30" }] : [],
    upcomingMeetings: [{ startsAt: "2026-10-12T15:00:00Z", endsAt: "2026-10-12T15:30:00Z", counterpartName: isMentor ? "Northstar Labs" : "Maya Chen", topic: "Pricing strategy" }],
    profileComplete: true,
    roleSetupComplete: true,
    startups: [
      { id: "demo-startup-semester-northstar", semesterId: "demo-semester", name: "Northstar Labs", industry: "Climate intelligence", stage: "Seed", description: "Decision tools that help industrial teams forecast and manage climate-related operational risk.", websiteUrl: "https://northstar.demo", goals: ["Launch enterprise pilots"], mentorshipNeeds: ["Enterprise sales", "Pricing"], mentorNeedContext: "Preparing for our first enterprise pilot.", people: [{ id: "demo-profile-nadia", name: "Nadia Rahman", email: "nadia@northstar.demo", photoUrl: null }, { id: "demo-profile-eli", name: "Eli Brooks", email: "eli@northstar.demo", photoUrl: null }] },
      { id: "demo-startup-semester-luma", semesterId: "demo-semester", name: "Luma Health", industry: "Care navigation", stage: "Pre-seed", description: "A guided care platform that helps families understand options and find trusted providers faster.", websiteUrl: "https://luma.demo", goals: ["Validate the product"], mentorshipNeeds: ["Product", "Fundraising"], mentorNeedContext: null, people: [{ id: "demo-profile-alex", name: "Alex Rivera", email: "alex@luma.demo", photoUrl: null }] },
      { id: "demo-startup-semester-forge", semesterId: "demo-semester", name: "Forge Robotics", industry: "Warehouse automation", stage: "Seed", description: "Modular robotic systems that make warehouse automation accessible to mid-market operators.", websiteUrl: null, goals: [], mentorshipNeeds: ["Hiring"], mentorNeedContext: null, people: [] },
    ],
    network: network.map((entry) => ({
      ...entry,
      email: `${entry.id.replace("demo-", "")}@example.com`,
      linkedinUrl: entry.kind === "mentor" ? "https://linkedin.com/in/example" : null,
    })),
    mentorNeeds: isMentor ? null : { needs: ["Enterprise sales", "Pricing"], context: "We are preparing for our first enterprise pilot and need help tightening the buying process.", noPreference: false },
    profile: isMentor
      ? { headline: "VP Revenue · Helio", summary: "I help early teams build repeatable enterprise sales systems.", tags: ["Enterprise sales", "Go-to-market", "Hiring"], websiteUrl: "https://helio.demo", linkedinUrl: "https://linkedin.com/in/maya-demo" }
      : { headline: "Climate intelligence · Seed", summary: "Northstar helps industrial teams forecast climate-related operational risk.", tags: ["Enterprise sales", "Pricing", "Fundraising"], websiteUrl: "https://northstar.demo", linkedinUrl: "https://linkedin.com/in/nadia-demo" },
  });
}
