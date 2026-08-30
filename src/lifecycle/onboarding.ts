import type { ProgramRole } from "./types.ts";

export type OnboardingItemKey =
  | "identity"
  | "company_snapshot"
  | "team_contacts"
  | "mentor_profile"
  | "expertise"
  | "availability"
  | "company_links"
  | "profile_links"
  | "admin_scope";

export interface OnboardingChecklistItem {
  key: OnboardingItemKey;
  label: string;
  description: string;
  required: boolean;
  step: 1 | 2 | 3 | "later";
}

const CHECKLISTS: Readonly<Record<ProgramRole, readonly OnboardingChecklistItem[]>> = {
  startup: [
    {
      key: "identity",
      label: "Confirm your identity",
      description: "Check your name and preferred contact details.",
      required: true,
      step: 1,
    },
    {
      key: "company_snapshot",
      label: "Add a company snapshot",
      description: "Share a concise description, stage, and current goals.",
      required: true,
      step: 2,
    },
    {
      key: "team_contacts",
      label: "Confirm the team",
      description: "Make sure every participating teammate can be reached.",
      required: true,
      step: 2,
    },
    {
      key: "availability",
      label: "Set shared availability",
      description: "Choose the times when your team can meet mentors.",
      required: true,
      step: 3,
    },
    {
      key: "company_links",
      label: "Add company links",
      description: "Optionally add a website, deck, or product demo.",
      required: false,
      step: "later",
    },
  ],
  mentor: [
    {
      key: "identity",
      label: "Confirm your identity",
      description: "Check your name and preferred contact details.",
      required: true,
      step: 1,
    },
    {
      key: "mentor_profile",
      label: "Review your profile",
      description: "Add a short biography that helps founders know you.",
      required: true,
      step: 2,
    },
    {
      key: "expertise",
      label: "Choose expertise",
      description: "Select the topics where you can be most useful.",
      required: true,
      step: 2,
    },
    {
      key: "availability",
      label: "Set availability",
      description: "Choose the times when you can meet startups.",
      required: true,
      step: 3,
    },
    {
      key: "profile_links",
      label: "Add profile links",
      description: "Optionally add LinkedIn or other useful context.",
      required: false,
      step: "later",
    },
  ],
  admin: [
    {
      key: "identity",
      label: "Confirm your identity",
      description: "Check your name and preferred contact details.",
      required: true,
      step: 1,
    },
    {
      key: "admin_scope",
      label: "Review your scope",
      description: "Confirm the semesters and operations you manage.",
      required: true,
      step: 2,
    },
  ],
};

export interface OnboardingProgress {
  ready: boolean;
  percent: number;
  completed: number;
  total: number;
  required: { completed: number; total: number };
  next: OnboardingChecklistItem | null;
}

export function getOnboardingChecklist(
  role: ProgramRole,
): readonly OnboardingChecklistItem[] {
  return CHECKLISTS[role];
}

export function calculateOnboardingProgress(
  role: ProgramRole,
  completedKeys: ReadonlySet<string>,
): OnboardingProgress {
  const checklist = getOnboardingChecklist(role);
  const requiredItems = checklist.filter((item) => item.required);
  const completed = checklist.filter((item) => completedKeys.has(item.key)).length;
  const requiredCompleted = requiredItems.filter((item) => completedKeys.has(item.key)).length;

  return {
    ready: requiredCompleted === requiredItems.length,
    percent: checklist.length === 0 ? 100 : Math.round((completed / checklist.length) * 100),
    completed,
    total: checklist.length,
    required: {
      completed: requiredCompleted,
      total: requiredItems.length,
    },
    next: checklist.find((item) => !completedKeys.has(item.key)) ?? null,
  };
}
