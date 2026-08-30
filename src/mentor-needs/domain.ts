export const CANONICAL_MENTOR_NEEDS = [
  "Fundraising strategy",
  "Enterprise sales",
  "Go-to-market",
  "Product strategy",
  "Hiring and team building",
  "Legal and incorporation",
  "Marketing and brand",
] as const;

export interface MentorNeedSelectionInput {
  primary: string | null;
  secondary: string | null;
  noPreference: boolean;
  context: string;
}

export interface MentorNeedSelection {
  needs: string[];
  noPreference: boolean;
  context: string | null;
}

export interface MentorNeedsSource {
  startups: readonly { id: string; name: string; needs: readonly string[]; context: string | null }[];
  mentors: readonly { id: string; name: string; tags: readonly string[] }[];
  outreach: readonly { id: string; name: string; stage: string; tags: readonly string[] }[];
}

export interface MentorNeedsBoardRow {
  category: string;
  requestCount: number;
  mentorCount: number;
  outreachCount: number;
  status: "gap" | "tracking";
  startups: { id: string; name: string; context: string | null; isPrimary: boolean }[];
  mentors: { id: string; name: string }[];
  outreach: { id: string; name: string; stage: string }[];
}

function cleanLabel(value: string): string {
  const trimmed = value.trim().replace(/\s+/gu, " ");
  const canonical = CANONICAL_MENTOR_NEEDS.find((need) => need.toLocaleLowerCase() === trimmed.toLocaleLowerCase());
  return canonical ?? trimmed;
}

export function normalizeMentorNeedSelection(input: MentorNeedSelectionInput): MentorNeedSelection {
  const context = input.context.trim() || null;
  if (input.noPreference) return { needs: [], noPreference: true, context };
  const needs = [input.primary, input.secondary]
    .flatMap((value) => value === null || value.trim() === "" ? [] : [cleanLabel(value)]);
  if (needs.length === 0) throw new Error("Choose a mentor need or select no preference.");
  if (new Set(needs.map((need) => need.toLocaleLowerCase())).size !== needs.length) {
    throw new Error("Primary and secondary mentor needs must be different.");
  }
  return { needs, noPreference: false, context };
}

export function suggestMentorNeeds(query: string, categories: readonly string[]) {
  const cleaned = query.trim().replace(/\s+/gu, " ");
  if (cleaned === "") return { canonical: [] as string[], custom: null };
  const lower = cleaned.toLocaleLowerCase();
  const canonical = categories.filter((category) => category.toLocaleLowerCase().includes(lower));
  const exact = categories.some((category) => category.toLocaleLowerCase() === lower);
  return { canonical, custom: exact ? null : cleaned };
}

const ACTIVE_OUTREACH_STAGES = new Set(["prospect", "researching", "ready", "contacted", "responded", "meeting", "nurture"]);

function hasTag(tags: readonly string[], category: string): boolean {
  const target = category.toLocaleLowerCase();
  return tags.some((tag) => tag.trim().toLocaleLowerCase() === target);
}

export function buildMentorNeedsBoard(source: MentorNeedsSource): MentorNeedsBoardRow[] {
  const demand = new Map<string, { category: string; startups: MentorNeedsBoardRow["startups"] }>();
  for (const startup of source.startups) {
    startup.needs.forEach((rawCategory, index) => {
      const category = cleanLabel(rawCategory);
      if (category === "") return;
      const key = category.toLocaleLowerCase();
      const entry = demand.get(key) ?? { category, startups: [] };
      entry.startups.push({ id: startup.id, name: startup.name, context: startup.context, isPrimary: index === 0 });
      demand.set(key, entry);
    });
  }

  return [...demand.values()].map(({ category, startups }) => {
    const mentors = source.mentors.filter((mentor) => hasTag(mentor.tags, category)).map(({ id, name }) => ({ id, name }));
    const outreach = source.outreach
      .filter((contact) => ACTIVE_OUTREACH_STAGES.has(contact.stage) && hasTag(contact.tags, category))
      .map(({ id, name, stage }) => ({ id, name, stage }));
    return {
      category,
      requestCount: startups.length,
      mentorCount: mentors.length,
      outreachCount: outreach.length,
      status: mentors.length === 0 ? "gap" as const : "tracking" as const,
      startups,
      mentors,
      outreach,
    };
  }).sort((left, right) => right.requestCount - left.requestCount || left.category.localeCompare(right.category));
}
