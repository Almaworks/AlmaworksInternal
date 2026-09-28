export interface OnboardingDraft {
  role: "mentor" | "startup";
  name: string;
  organization: string;
  description: string;
  expertise: string[];
  teamContact: string;
}
export type AvailabilitySetupChoice = "set-hours-next" | "add-later";
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
/** Read only this membership's saved role keys, preserving intentionally empty drafts. */
export function restoreOnboardingDraft(base: OnboardingDraft, saved: unknown): OnboardingDraft & { step: 1 | 2 | 3; availabilityChoice: AvailabilitySetupChoice } {
  const items = Array.isArray(saved) ? saved.map(record) : [];
  const item = (key: string) => items.find(i => i.item_key === key);
  const details = record(item(base.role === "mentor" ? "mentor_profile" : "company_snapshot")?.payload);
  const tags = record(item("expertise")?.payload).expertise;
  const contact = record(item("team_contacts")?.payload).teamContact;
  const savedAvailabilityChoice = record(item("mentoring_hours_setup")?.payload).choice;
  const availabilityChoice: AvailabilitySetupChoice = savedAvailabilityChoice === "add-later"
    ? "add-later"
    : "set-hours-next";
  const result = {
    ...base,
    organization: typeof details.organization === "string" ? details.organization : base.organization,
    description: typeof details.description === "string" ? details.description : base.description,
    expertise: base.role === "mentor" && Array.isArray(tags) && tags.every(t => typeof t === "string") ? tags as string[] : base.expertise,
    teamContact: base.role === "startup" && typeof contact === "string" ? contact : base.teamContact,
  };
  const confirmedIdentity = typeof item("identity")?.completed_at === "string" && !!base.name.trim();
  const complete = !!result.organization.trim() && !!result.description.trim()
    && (base.role === "mentor" ? result.expertise.some(t => t.trim()) : !!result.teamContact.trim());
  return { ...result, step: confirmedIdentity ? complete ? 3 : 2 : 1, availabilityChoice };
}
