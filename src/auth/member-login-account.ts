export type MemberLoginState = "enabled" | "disabled" | "removal_incomplete" | "removed" | "not_configured";
export type MemberLoginAction = "remove" | "retry_removal" | "restore";
export type MemberLoginPresentation = {
  action: MemberLoginAction;
  label: string;
  state: MemberLoginState;
  tone: "success" | "warning" | "muted";
};
export type RemoveMemberLoginBody = { confirmation: "REMOVE"; reason: string };
export type RestoreMemberLoginBody = { confirmation: "RESTORE" };

type MemberLoginPresentationInput = {
  authUserId: string | null;
  latestRemovalAuditAction: "member.login_removal_prepared" | "member.login_restored" | null;
  profileActive: boolean;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new Error("Request body must be an object.");
  return value;
}

function normalizedReason(value: unknown): string {
  if (typeof value !== "string") throw new Error("reason must be a string.");
  const reason = value.replace(/\s+/gu, " ").trim();
  if (reason.replace(/\s/gu, "").length < 3) {
    throw new Error("reason must contain at least 3 non-whitespace characters.");
  }
  if (reason.length > 500) throw new Error("reason must be at most 500 characters.");
  return reason;
}

export function memberLoginPresentation(input: MemberLoginPresentationInput): MemberLoginPresentation {
  if (input.authUserId !== null) {
    if (input.latestRemovalAuditAction === "member.login_removal_prepared") {
      return {
        action: "retry_removal",
        label: "Removal incomplete",
        state: "removal_incomplete",
        tone: "warning",
      };
    }
    if (!input.profileActive) {
      return {
        action: "remove",
        label: "Account disabled",
        state: "disabled",
        tone: "warning",
      };
    }
    return {
      action: "remove",
      label: "Login enabled",
      state: "enabled",
      tone: "success",
    };
  }

  if (input.latestRemovalAuditAction === "member.login_removal_prepared") {
    return {
      action: "restore",
      label: "Login removed",
      state: "removed",
      tone: "muted",
    };
  }
  return {
    action: "restore",
    label: "No login",
    state: "not_configured",
    tone: "muted",
  };
}

export function parseRemoveMemberLoginBody(value: unknown): RemoveMemberLoginBody {
  const body = requireObject(value);
  if (body.confirmation !== "REMOVE") {
    throw new Error("confirmation must be the exact type REMOVE.");
  }
  return { confirmation: "REMOVE", reason: normalizedReason(body.reason) };
}

export function parseRestoreMemberLoginBody(value: unknown): RestoreMemberLoginBody {
  const body = requireObject(value);
  if (body.confirmation !== "RESTORE") {
    throw new Error("confirmation must be the exact type RESTORE.");
  }
  return { confirmation: "RESTORE" };
}
