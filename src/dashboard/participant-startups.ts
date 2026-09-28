import type { ParticipantMembershipInput } from "./participant-dashboard.ts";

export interface StartupDirectoryProfile {
  id: string;
  semesterId: string;
  name: string;
  industry: string;
  stage: string;
  description: string;
  websiteUrl: string | null;
  goals: string[];
  mentorshipNeeds: string[];
  mentorNeedContext: string | null;
  people: Array<{ id: string; name: string; email: string | null; photoUrl: string | null }>;
}

/** Inputs come from the participant's RLS client; never infer people from company names. */
export function buildStartupDirectory(
  semesterId: string,
  startups: Array<Omit<StartupDirectoryProfile, "people">>,
  memberships: ParticipantMembershipInput[],
  teams: Array<{ startup_semester_id: string; semester_membership_id: string }>,
  profiles: Array<{ id: string; full_name: string | null; email: string | null; photoUrl: string | null }>,
): StartupDirectoryProfile[] {
  const activeMembers = new Map(memberships.filter((member) => member.semesterId === semesterId && member.role === "startup" && member.status === "active").map((member) => [member.id, member]));
  const people = new Map(profiles.map((profile) => [profile.id, profile]));
  return startups.filter((startup) => startup.semesterId === semesterId).map((startup) => {
    const associated = new Map<string, StartupDirectoryProfile["people"][number]>();
    for (const team of teams) {
      if (team.startup_semester_id !== startup.id) continue;
      const member = activeMembers.get(team.semester_membership_id);
      const person = member ? people.get(member.profileId) : undefined;
      if (person) associated.set(person.id, { id: person.id, name: person.full_name || "Startup member", email: person.email, photoUrl: person.photoUrl });
    }
    return { ...startup, people: [...associated.values()].sort((a, b) => a.name.localeCompare(b.name)) };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export function filterStartupDirectory(startups: StartupDirectoryProfile[], query: string): StartupDirectoryProfile[] {
  const needle = query.trim().toLowerCase();
  return startups.filter((startup) => [startup.name, startup.industry, startup.stage, startup.description, startup.mentorNeedContext, ...startup.goals, ...startup.mentorshipNeeds, ...startup.people.flatMap((person) => [person.name, person.email])].join(" ").toLowerCase().includes(needle));
}
