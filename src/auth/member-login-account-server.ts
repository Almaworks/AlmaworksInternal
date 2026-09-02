import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../db/types.ts";
import { requireAuthenticatedUser } from "./server.ts";

export interface RpcError {
  code?: string;
  message: string;
}

export interface RpcResult<T> {
  data: T | null;
  error: RpcError | null;
}

export interface MemberLoginRemovalPreviewRow {
  already_prepared: boolean;
  auth_user_id: string | null;
  email: string;
  full_name: string;
  profile_id: string;
  profile_is_active: boolean;
  semester_count: number;
  session_count: number;
  suspend_membership_ids: string[];
}

export interface MemberLoginRemovalPreparedRow {
  auth_user_id: string | null;
  profile_id: string;
  profile_is_active: boolean;
  suspended_membership_ids: string[];
}

export interface MemberLoginRestoredRow {
  auth_user_id: string;
  profile_id: string;
  profile_is_active: boolean;
}

export interface ReplacementPlaceholderDiscardedRow {
  auth_user_id: string;
  placeholder_discarded: boolean;
  profile_id: string;
}

export interface AuthDeleteResult {
  error: { message: string } | null;
}

export interface AuthInviteResult {
  data: { actionLink: string; userId: string } | null;
  error: { message: string } | null;
}

export interface ProfileLinkResult {
  data: { auth_user_id: string | null; is_active: boolean } | null;
  error: RpcError | null;
}

export interface MemberLoginAccountClient {
  preview(profileId: string): Promise<RpcResult<MemberLoginRemovalPreviewRow[]>>;
  prepare(args: {
    p_profile_id: string;
    p_reason: string;
  }): Promise<RpcResult<MemberLoginRemovalPreparedRow[]>>;
  deleteAuthUser(userId: string, shouldSoftDelete: false): Promise<AuthDeleteResult>;
  generateInvite(email: string, redirectTo: string): Promise<AuthInviteResult>;
  attach(args: {
    p_auth_user_id: string;
    p_profile_id: string;
  }): Promise<RpcResult<MemberLoginRestoredRow[]>>;
  discardPlaceholder(args: {
    p_auth_user_id: string;
    p_profile_id: string;
  }): Promise<RpcResult<ReplacementPlaceholderDiscardedRow[]>>;
  verifyProfile(profileId: string): Promise<ProfileLinkResult>;
}

export interface MemberLoginRemovalPreview {
  alreadyPrepared: boolean;
  email: string;
  fullName: string;
  hasLogin: boolean;
  profileActive: boolean;
  profileId: string;
  semesterCount: number;
  sessionCount: number;
  suspendMembershipIds: string[];
}

export interface MemberLoginRemovalResult {
  profileActive: false;
  profileId: string;
  removed: true;
}

export interface MemberLoginRestorationResult {
  actionLink: string;
  mustSendLink: true;
  profileActive: true;
  profileId: string;
}

export class MemberLoginAccountError extends Error {
  readonly code: string;

  constructor(message: string, code = "member_login_operation_failed") {
    super(message);
    this.name = "MemberLoginAccountError";
    this.code = code;
  }
}

export class MemberLoginReconciliationError extends Error {
  readonly databaseState: "disabled" | "unknown";
  readonly reconciliationRequired = true;

  constructor(message: string, databaseState: "disabled" | "unknown") {
    super(message);
    this.name = "MemberLoginReconciliationError";
    this.databaseState = databaseState;
  }
}

function operationError(error: RpcError): MemberLoginAccountError {
  return new MemberLoginAccountError(error.message, error.code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireSingleRow<T extends { profile_id: string }>(
  result: RpcResult<T[]>,
  profileId: string,
  operation: string,
): T {
  if (result.error !== null) throw operationError(result.error);
  if (result.data === null || result.data.length !== 1 || result.data[0].profile_id !== profileId) {
    throw new MemberLoginAccountError(`${operation} returned an invalid result.`, "invalid_result");
  }
  return result.data[0];
}

export async function previewMemberLoginRemoval(
  client: MemberLoginAccountClient,
  profileId: string,
): Promise<MemberLoginRemovalPreview> {
  const row = requireSingleRow(await client.preview(profileId), profileId, "Login removal preview");
  return {
    alreadyPrepared: row.already_prepared,
    email: row.email,
    fullName: row.full_name,
    hasLogin: row.auth_user_id !== null,
    profileActive: row.profile_is_active,
    profileId: row.profile_id,
    semesterCount: row.semester_count,
    sessionCount: row.session_count,
    suspendMembershipIds: row.suspend_membership_ids,
  };
}

async function verifyRemovedProfile(
  client: MemberLoginAccountClient,
  profileId: string,
): Promise<void> {
  const verification = await client.verifyProfile(profileId);
  if (verification.error !== null || verification.data === null) return;
  const verifiedProfile: unknown = verification.data;
  if (!isRecord(verifiedProfile)) return;
  if (
    (typeof verifiedProfile.auth_user_id === "string" && verifiedProfile.auth_user_id.length > 0)
    || verifiedProfile.is_active === true
  ) {
    throw new MemberLoginReconciliationError(
      "Program access is disabled, but login removal could not be verified.",
      "disabled",
    );
  }
}

export async function removeMemberLogin(
  client: MemberLoginAccountClient,
  input: { profileId: string; reason: string },
): Promise<MemberLoginRemovalResult> {
  const prepared = requireSingleRow(await client.prepare({
    p_profile_id: input.profileId,
    p_reason: input.reason,
  }), input.profileId, "Login removal preparation");

  if (prepared.profile_is_active) {
    throw new MemberLoginReconciliationError(
      "Login removal preparation did not disable the member profile.",
      "unknown",
    );
  }

  if (prepared.auth_user_id !== null) {
    const deletion = await client.deleteAuthUser(prepared.auth_user_id, false);
    if (deletion.error !== null) {
      throw new MemberLoginReconciliationError(
        "Program access is disabled, but the login account still needs to be removed.",
        "disabled",
      );
    }
  }

  await verifyRemovedProfile(client, input.profileId);
  return { profileActive: false, profileId: input.profileId, removed: true };
}

async function discardAndDeleteReplacement(
  client: MemberLoginAccountClient,
  profileId: string,
  authUserId: string,
): Promise<void> {
  const discard = await client.discardPlaceholder({
    p_auth_user_id: authUserId,
    p_profile_id: profileId,
  });
  const discardRow: unknown = Array.isArray(discard.data) ? discard.data[0] : undefined;
  if (
    discard.error !== null
    || !Array.isArray(discard.data)
    || discard.data.length !== 1
    || !isRecord(discardRow)
    || discardRow.profile_id !== profileId
    || discardRow.auth_user_id !== authUserId
    || typeof discardRow.placeholder_discarded !== "boolean"
  ) {
    throw new MemberLoginReconciliationError(
      "The replacement login could not be safely reconciled with the retained profile.",
      "disabled",
    );
  }

  const deletion = await client.deleteAuthUser(authUserId, false);
  if (deletion.error !== null) {
    throw new MemberLoginReconciliationError(
      "The replacement profile was discarded, but its Auth identity still needs cleanup.",
      "disabled",
    );
  }
}

export async function restoreMemberLogin(
  client: MemberLoginAccountClient,
  input: { profileId: string; redirectTo: string },
): Promise<MemberLoginRestorationResult> {
  const preview = requireSingleRow(
    await client.preview(input.profileId),
    input.profileId,
    "Login restoration preview",
  );
  if (preview.auth_user_id !== null || preview.profile_is_active) {
    throw new MemberLoginAccountError(
      "Retained profile must be unlinked and disabled before restoring login.",
      "55000",
    );
  }

  const invitation = await client.generateInvite(preview.email, input.redirectTo);
  if (invitation.error !== null) {
    throw new MemberLoginAccountError(invitation.error.message, "auth_invite_failed");
  }
  if (invitation.data === null) {
    throw new MemberLoginReconciliationError(
      "Auth invitation returned an invalid result and may require cleanup.",
      "disabled",
    );
  }

  const attachment = await client.attach({
    p_auth_user_id: invitation.data.userId,
    p_profile_id: input.profileId,
  });
  if (attachment.error !== null) {
    await discardAndDeleteReplacement(client, input.profileId, invitation.data.userId);
    throw operationError(attachment.error);
  }
  const attached: unknown = Array.isArray(attachment.data) ? attachment.data[0] : undefined;
  if (
    !Array.isArray(attachment.data)
    || attachment.data.length !== 1
    || !isRecord(attached)
  ) {
    throw new MemberLoginReconciliationError(
      "Replacement login attachment returned an ambiguous result.",
      "unknown",
    );
  }
  if (
    attached.profile_id !== input.profileId
    || attached.auth_user_id !== invitation.data.userId
    || attached.profile_is_active !== true
  ) {
    throw new MemberLoginReconciliationError(
      "Replacement login attachment returned an ambiguous result.",
      "unknown",
    );
  }

  return {
    actionLink: invitation.data.actionLink,
    mustSendLink: true,
    profileActive: true,
    profileId: input.profileId,
  };
}

function rpcError(error: { code?: string; message: string } | null): RpcError | null {
  return error === null ? null : { code: error.code, message: error.message };
}

export function createMemberLoginAccountProductionClient(
  userClient: SupabaseClient<Database>,
  adminClient: SupabaseClient<Database>,
): MemberLoginAccountClient {
  return {
    preview: async (profileId) => {
      const result = await userClient.rpc("preview_member_login_removal", { p_profile_id: profileId });
      return { data: result.data, error: rpcError(result.error) };
    },
    prepare: async (args) => {
      const result = await userClient.rpc("prepare_member_login_removal", args);
      return { data: result.data, error: rpcError(result.error) };
    },
    deleteAuthUser: async (userId, shouldSoftDelete) => {
      const result = await adminClient.auth.admin.deleteUser(userId, shouldSoftDelete);
      return { error: result.error === null ? null : { message: result.error.message } };
    },
    generateInvite: async (email, redirectTo) => {
      const result = await adminClient.auth.admin.generateLink({
        email,
        options: { redirectTo },
        type: "invite",
      });
      if (result.error !== null) return { data: null, error: { message: result.error.message } };
      const actionLink = result.data.properties?.action_link;
      const userId = result.data.user?.id;
      return {
        data: actionLink && userId ? { actionLink, userId } : null,
        error: null,
      };
    },
    attach: async (args) => {
      const result = await userClient.rpc("attach_replacement_auth_identity", args);
      return { data: result.data, error: rpcError(result.error) };
    },
    discardPlaceholder: async (args) => {
      const result = await userClient.rpc("discard_replacement_auth_placeholder", args);
      return { data: result.data, error: rpcError(result.error) };
    },
    verifyProfile: async (profileId) => {
      const result = await userClient
        .from("profiles")
        .select("auth_user_id,is_active")
        .eq("id", profileId)
        .maybeSingle();
      return { data: result.data, error: rpcError(result.error) };
    },
  };
}

export async function authorizeMemberLoginAccountClient(
  request: Request,
): Promise<MemberLoginAccountClient> {
  const { userClient, adminClient } = await requireAuthenticatedUser(request);
  return createMemberLoginAccountProductionClient(userClient, adminClient);
}
