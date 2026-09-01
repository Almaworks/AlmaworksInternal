import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

import type { Database } from "../db/types.ts";
import { readBearerToken } from "./request.ts";

export class AuthorizationError extends Error {
  readonly status: 401 | 403 | 500;

  constructor(message: string, status: 401 | 403 | 500) {
    super(message);
    this.name = "AuthorizationError";
    this.status = status;
  }
}

export interface AuthenticatedRlsContext {
  user: User;
  profileId: string;
  userClient: SupabaseClient<Database>;
}

interface AuthorizedContext extends AuthenticatedRlsContext {
  adminClient: SupabaseClient<Database>;
}

type SuspendMembershipArgs =
  Database["public"]["Functions"]["suspend_outreach_membership"]["Args"];
type SuspendMembershipRows =
  Database["public"]["Functions"]["suspend_outreach_membership"]["Returns"];

interface MembershipSuspensionRpcError {
  code?: string;
  message: string;
}

interface MembershipSuspensionRpcResponse<T> {
  data: T | null;
  error: MembershipSuspensionRpcError | null;
}

export interface MembershipSuspensionRpcClient {
  suspendOutreachMembership(
    args: SuspendMembershipArgs,
  ): Promise<MembershipSuspensionRpcResponse<SuspendMembershipRows>>;
}

export type AuthorizeMembershipSuspension = (
  request: Request,
  semesterId: string,
) => Promise<MembershipSuspensionRpcClient>;

export interface SuspendOutreachMembershipInput {
  request: Request;
  semesterId: string;
  profileId: string;
  reason: string;
  updatedAt: string;
}

export interface SuspendedOutreachMembership {
  membershipId: string;
  membershipStatus: "suspended";
  membershipUpdatedAt: string;
  releasedOpportunityIds: readonly string[];
}

interface MembershipSuspensionConflict {
  kind: "conflict";
  code: "stale_updated_at";
  message: string;
}

export type SuspendOutreachMembershipResult =
  | { ok: true; value: SuspendedOutreachMembership }
  | { ok: false; error: MembershipSuspensionConflict };

export class MembershipSuspensionError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "MembershipSuspensionError";
    this.code = code;
  }
}

function getPublicSupabaseEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new AuthorizationError("Missing Supabase server environment variables.", 500);
  }
  return { url, anonKey };
}

export async function requireAuthenticatedUserWithRls(request: Request): Promise<AuthenticatedRlsContext> {
  const token = readBearerToken(request.headers.get("authorization"));
  if (!token) throw new AuthorizationError("Missing bearer token.", 401);

  const { url, anonKey } = getPublicSupabaseEnvironment();
  const authOptions = { persistSession: false, autoRefreshToken: false };
  const userClient = createClient<Database>(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: authOptions,
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) throw new AuthorizationError("Invalid authentication token.", 401);

  const profile = await userClient
    .from("profiles")
    .select("id")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  if (profile.error) throw new AuthorizationError("Could not resolve authenticated profile.", 500);
  if (!profile.data) throw new AuthorizationError("Authenticated profile not found.", 403);

  return {
    user: data.user,
    profileId: profile.data.id,
    userClient,
  };
}

export async function requireAuthenticatedUser(request: Request): Promise<AuthorizedContext> {
  const context = await requireAuthenticatedUserWithRls(request);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new AuthorizationError("Missing Supabase server environment variables.", 500);
  }
  const { url } = getPublicSupabaseEnvironment();
  const authOptions = { persistSession: false, autoRefreshToken: false };
  return {
    ...context,
    adminClient: createClient<Database>(url, serviceRoleKey, { auth: authOptions }),
  };
}

export async function requireSemesterAdmin(
  request: Request,
  semesterId: string,
): Promise<AuthorizedContext> {
  const context = await requireAuthenticatedUser(request);
  const { data, error } = await context.userClient.rpc("can_manage_semester", {
    target_semester_id: semesterId,
    candidate_id: context.user.id,
  });
  if (error || data !== true) {
    throw new AuthorizationError("Semester administrator access required.", 403);
  }
  return context;
}

function assertSuspensionText(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new MembershipSuspensionError(`${field} is required.`, "validation_error");
  }
}

function assertSuspensionTimestamp(value: string): void {
  if (
    !/(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    || Number.isNaN(Date.parse(value))
  ) {
    throw new MembershipSuspensionError(
      "updatedAt must be a valid ISO timestamp with an explicit timezone.",
      "validation_error",
    );
  }
}

const authorizeSuspensionWithServerContext: AuthorizeMembershipSuspension = async (
  request,
  semesterId,
) => {
  const { userClient } = await requireSemesterAdmin(request, semesterId);
  return {
    suspendOutreachMembership: async (args) =>
      await userClient.rpc("suspend_outreach_membership", args),
  };
};

export function createSuspendOutreachMembershipCommand(
  authorize: AuthorizeMembershipSuspension,
) {
  return async function suspendMembership(
    input: SuspendOutreachMembershipInput,
  ): Promise<SuspendOutreachMembershipResult> {
    assertSuspensionText(input.semesterId, "semesterId");
    assertSuspensionText(input.profileId, "profileId");
    assertSuspensionText(input.reason, "reason");
    assertSuspensionTimestamp(input.updatedAt);

    const client = await authorize(input.request, input.semesterId);
    const { data, error } = await client.suspendOutreachMembership({
      p_expected_updated_at: input.updatedAt,
      p_profile_id: input.profileId,
      p_reason: input.reason.trim(),
      p_semester_id: input.semesterId,
    });

    if (error?.code === "40001") {
      return {
        ok: false,
        error: {
          kind: "conflict",
          code: "stale_updated_at",
          message: "Semester membership changed after it was loaded.",
        },
      };
    }
    if (error !== null) {
      throw new MembershipSuspensionError(error.message, error.code);
    }
    if (data === null || data.length !== 1) {
      throw new MembershipSuspensionError(
        "Atomic membership suspension returned an invalid result.",
      );
    }

    const row = data[0];
    if (row.membership_status !== "suspended") {
      throw new MembershipSuspensionError(
        "Atomic membership suspension did not suspend the membership.",
      );
    }

    return {
      ok: true,
      value: {
        membershipId: row.membership_id,
        membershipStatus: row.membership_status,
        membershipUpdatedAt: row.membership_updated_at,
        releasedOpportunityIds: row.released_opportunity_ids,
      },
    };
  };
}

export const suspendOutreachMembership = createSuspendOutreachMembershipCommand(
  authorizeSuspensionWithServerContext,
);
