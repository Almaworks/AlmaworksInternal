import type { MembershipStatus } from "./types.ts";

export type MembershipReadinessStatus = "not_started" | "in_progress" | "ready" | null;

export type MembershipPresentationState =
  | "invited"
  | "onboarding"
  | "ready_for_activation"
  | "active"
  | "alumni"
  | "suspended";

export type MembershipVisibility = "all" | "active";

export interface MembershipPresentation {
  state: MembershipPresentationState;
  label: "Invited" | "Onboarding" | "Ready for activation" | "Active" | "Alumni" | "Suspended";
  tone: "neutral" | "progress" | "attention" | "success" | "historical" | "danger";
  action: "activate" | "suspend" | "restore" | null;
}

export interface MembershipPresentationInput {
  status: MembershipStatus;
  readinessStatus: MembershipReadinessStatus;
}

export function membershipPresentationState(input: MembershipPresentationInput): MembershipPresentationState {
  if (input.status === "onboarding" && input.readinessStatus === "ready") {
    return "ready_for_activation";
  }
  return input.status;
}

export function membershipPresentation(input: MembershipPresentationInput): MembershipPresentation {
  const state = membershipPresentationState(input);
  switch (state) {
    case "invited":
      return { state, label: "Invited", tone: "neutral", action: null };
    case "onboarding":
      return { state, label: "Onboarding", tone: "progress", action: null };
    case "ready_for_activation":
      return { state, label: "Ready for activation", tone: "attention", action: "activate" };
    case "active":
      return { state, label: "Active", tone: "success", action: "suspend" };
    case "alumni":
      return { state, label: "Alumni", tone: "historical", action: null };
    case "suspended":
      return { state, label: "Suspended", tone: "danger", action: "restore" };
  }
}

export function filterMembershipsByVisibility<T extends { status: MembershipStatus }>(
  members: readonly T[],
  visibility: MembershipVisibility,
): T[] {
  return visibility === "all" ? [...members] : members.filter((member) => member.status === "active");
}
