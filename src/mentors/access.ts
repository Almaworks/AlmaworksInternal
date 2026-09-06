export type MentorAccessScope = "semester" | "global";

type RpcError = { code?: string; message: string };

type GlobalAccessRow = {
  auth_user_id: string | null;
  profile_id: string;
  profile_is_active: boolean;
  suspended_membership_ids: string[];
};

interface MentorAccessClient {
  setSemesterMembershipActivity(args: {
    p_is_active: boolean;
    p_membership_ids: string[];
    p_semester_id: string;
  }): Promise<{ data: number | null; error: RpcError | null }>;
  setGlobalMentorAccountAccess(args: {
    p_enabled: boolean;
    p_mentor_semester_id: string;
  }): Promise<{ data: GlobalAccessRow[] | null; error: RpcError | null }>;
  updateAuthUser(
    userId: string,
    attributes: { ban_duration: string },
  ): Promise<{ error: { message: string } | null }>;
}

type AuthorizeMentorAccess = (
  request: Request,
  semesterId: string,
) => Promise<MentorAccessClient>;

export class MentorAccessError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "MentorAccessError";
    this.code = code;
  }
}

export class MentorAccessReconciliationError extends MentorAccessError {
  readonly databaseState: "disabled" | "reinstated";

  constructor(message: string, databaseState: "disabled" | "reinstated") {
    super(message, "auth_reconciliation_required");
    this.name = "MentorAccessReconciliationError";
    this.databaseState = databaseState;
  }
}

export class MentorAccessValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MentorAccessValidationError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function requiredUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new MentorAccessValidationError(`${field} must be a UUID.`);
  }
  return value;
}

export function parseMentorAccessRequest(value: unknown): {
  enabled: boolean;
  membershipId: string;
  scope: MentorAccessScope;
  semesterId: string;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new MentorAccessValidationError("Request body is required.");
  }
  const input = value as Record<string, unknown>;
  if (input.scope !== "semester" && input.scope !== "global") {
    throw new MentorAccessValidationError("scope must be semester or global.");
  }
  if (typeof input.enabled !== "boolean") {
    throw new MentorAccessValidationError("enabled must be a boolean.");
  }
  return {
    enabled: input.enabled,
    membershipId: requiredUuid(input.membershipId, "membershipId"),
    scope: input.scope,
    semesterId: requiredUuid(input.semesterId, "semesterId"),
  };
}

export function createMentorAccessCommand(authorize: AuthorizeMentorAccess) {
  return async function setMentorAccess(input: {
    enabled: boolean;
    membershipId: string;
    mentorSemesterId: string;
    request: Request;
    scope: MentorAccessScope;
    semesterId: string;
  }) {
    const client = await authorize(input.request, input.semesterId);
    if (input.scope === "semester") {
      const { data, error } = await client.setSemesterMembershipActivity({
        p_is_active: input.enabled,
        p_membership_ids: [input.membershipId],
        p_semester_id: input.semesterId,
      });
      if (error) throw new MentorAccessError(error.message, error.code);
      if (data !== 1) {
        throw new MentorAccessError(
          `Semester access change updated ${data ?? 0} memberships instead of 1.`,
          "partial_update",
        );
      }
      return {
        scope: "semester" as const,
        status: input.enabled ? "active" as const : "suspended" as const,
        updated: data,
      };
    }

    const { data, error } = await client.setGlobalMentorAccountAccess({
      p_enabled: input.enabled,
      p_mentor_semester_id: input.mentorSemesterId,
    });
    if (error) throw new MentorAccessError(error.message, error.code);
    if (!data || data.length !== 1 || data[0].profile_is_active !== input.enabled) {
      throw new MentorAccessError("Global mentor access returned an invalid result.", "invalid_result");
    }

    const row = data[0];
    const databaseState = input.enabled ? "reinstated" as const : "disabled" as const;
    if (row.auth_user_id) {
      const authResult = await client.updateAuthUser(row.auth_user_id, {
        ban_duration: input.enabled ? "none" : "876000h",
      });
      if (authResult.error) {
        throw new MentorAccessReconciliationError(
          `Database access is ${databaseState}, but Auth could not be updated: ${authResult.error.message}`,
          databaseState,
        );
      }
    }

    return {
      authUpdated: row.auth_user_id !== null,
      profileId: row.profile_id,
      scope: "global" as const,
      status: databaseState,
      suspendedMembershipIds: row.suspended_membership_ids,
    };
  };
}

export type MentorAccessPresentation = {
  label: string;
  semesterAction: "remove" | "restore" | null;
  tone: "success" | "muted" | "danger";
};

export function mentorAccessPresentation(input: {
  membershipStatus: string;
  profileActive: boolean;
}): MentorAccessPresentation {
  if (!input.profileActive) {
    return { label: "Account disabled", semesterAction: null, tone: "danger" };
  }
  if (input.membershipStatus === "active") {
    return { label: "Active", semesterAction: "remove", tone: "success" };
  }
  if (input.membershipStatus === "suspended") {
    return { label: "Removed from semester", semesterAction: "restore", tone: "muted" };
  }
  return { label: "Not active", semesterAction: null, tone: "muted" };
}
