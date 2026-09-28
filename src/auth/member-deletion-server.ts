import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../db/types.ts";
import { PROFILE_PHOTO_BUCKET } from "../profile-photos/urls.ts";
import { requireAuthenticatedUser } from "./server.ts";
import type { MemberDeletionPreview } from "./member-deletion.ts";

interface RpcError { code?: string; message: string }
interface RpcResult<T> { data: T | null; error: RpcError | null }

export interface DeletionPreviewRow {
  profile_id: string;
  full_name: string;
  email: string;
  version: string;
  status: "ready" | "in_progress" | "completed";
  counts: Record<string, number>;
  blockers: string[];
  impact: MemberDeletionPreview["impact"];
}
export interface PreparedDeletionRow {
  profile_id: string;
  status: "in_progress" | "completed";
  auth_user_id: string | null;
  operation_id: string;
}
interface FinalizedDeletionRow { profile_id: string; status: "completed" }

export interface MemberDeletionClient {
  preview(profileId: string): Promise<RpcResult<DeletionPreviewRow[]>>;
  prepare(args: { p_profile_id: string; p_confirmation_email: string; p_reason: string; p_version: string }): Promise<RpcResult<PreparedDeletionRow[]>>;
  listPersonalFiles(profileId: string): Promise<{ paths: string[]; error: { message: string } | null }>;
  removePersonalFiles(paths: string[]): Promise<{ error: { message: string } | null }>;
  deleteAuthUser(authUserId: string, softDelete: false): Promise<{ error: { status?: number; message: string } | null }>;
  finalize(args: { p_profile_id: string; p_operation_id: string }): Promise<RpcResult<FinalizedDeletionRow[]>>;
}

export class MemberDeletionError extends Error {
  readonly code: string;
  readonly reconciliationRequired: boolean;

  constructor(message: string, code = "member_deletion_failed", reconciliationRequired = false) {
    super(message);
    this.name = "MemberDeletionError";
    this.code = code;
    this.reconciliationRequired = reconciliationRequired;
  }
}

function singleRow<T extends { profile_id: string }>(result: RpcResult<T[]>, profileId: string, stage: string): T {
  if (result.error) throw new MemberDeletionError(result.error.message, result.error.code, stage === "finalization");
  if (!Array.isArray(result.data) || result.data.length !== 1 || result.data[0].profile_id !== profileId) {
    throw new MemberDeletionError(`${stage} returned an invalid result.`, "invalid_result", stage !== "preview");
  }
  return result.data[0];
}

export async function previewMemberDeletion(client: MemberDeletionClient, profileId: string): Promise<MemberDeletionPreview> {
  const row = singleRow(await client.preview(profileId), profileId, "preview");
  if (!["ready", "in_progress", "completed"].includes(row.status) || typeof row.version !== "string"
      || !Array.isArray(row.blockers) || !row.counts || typeof row.counts !== "object"
      || !row.impact || !Array.isArray(row.impact.semesters) || !Array.isArray(row.impact.sharedStartups)
      || !Array.isArray(row.impact.upcomingMentorMeetings)) {
    throw new MemberDeletionError("Deletion preview returned an invalid result.", "invalid_result");
  }
  return { profileId, fullName: row.full_name, email: row.email, version: row.version,
    status: row.status, counts: row.counts, blockers: row.blockers, impact: row.impact };
}

export async function deleteMemberPersonalData(
  client: MemberDeletionClient,
  input: { profileId: string; confirmationEmail: string; reason: string; version: string },
): Promise<{ profileId: string; status: "completed" }> {
  const prepared = singleRow(await client.prepare({
    p_profile_id: input.profileId, p_confirmation_email: input.confirmationEmail,
    p_reason: input.reason, p_version: input.version,
  }), input.profileId, "preparation");
  if (prepared.status === "completed") return { profileId: input.profileId, status: "completed" };
  if (prepared.status !== "in_progress" || !prepared.operation_id) {
    throw new MemberDeletionError("Deletion preparation returned an invalid state.", "invalid_result", true);
  }

  const files = await client.listPersonalFiles(input.profileId);
  if (files.error) throw new MemberDeletionError("Personal file cleanup could not be verified. Retry the deletion.", "storage_cleanup_failed", true);
  if (files.paths.some((path) => !path.startsWith(`${input.profileId}/`))) {
    throw new MemberDeletionError("Personal file inventory contained an unexpected path.", "invalid_storage_path", true);
  }
  for (let index = 0; index < files.paths.length; index += 100) {
    const deletion = await client.removePersonalFiles(files.paths.slice(index, index + 100));
    if (deletion.error) throw new MemberDeletionError("Personal file cleanup is incomplete. Retry the deletion.", "storage_cleanup_failed", true);
  }
  const remaining = await client.listPersonalFiles(input.profileId);
  if (remaining.error || remaining.paths.length !== 0) {
    throw new MemberDeletionError("Personal file cleanup could not be verified. Retry the deletion.", "storage_cleanup_failed", true);
  }

  if (prepared.auth_user_id) {
    const authResult = await client.deleteAuthUser(prepared.auth_user_id, false);
    if (authResult.error && authResult.error.status !== 404) {
      throw new MemberDeletionError("Login deletion is incomplete. Retry the deletion.", "auth_cleanup_failed", true);
    }
  }
  const finalized = singleRow(await client.finalize({
    p_profile_id: input.profileId, p_operation_id: prepared.operation_id,
  }), input.profileId, "finalization");
  if (finalized.status !== "completed") {
    throw new MemberDeletionError("Deletion could not be verified. Retry the deletion.", "invalid_result", true);
  }
  return { profileId: input.profileId, status: "completed" };
}

type DeletionRpcName = "preview_member_deletion" | "prepare_member_deletion" | "finalize_member_deletion";
type DeletionRpc = (name: DeletionRpcName, args: Record<string, string>) => PromiseLike<RpcResult<unknown>>;
function rpcResult<T>(value: RpcResult<unknown>): RpcResult<T> {
  return { data: value.data as T | null, error: value.error };
}

export function createMemberDeletionProductionClient(
  userClient: SupabaseClient<Database>, adminClient: SupabaseClient<Database>,
): MemberDeletionClient {
  // The generated Database RPC definitions are refreshed alongside the migration.
  const rpc = userClient.rpc.bind(userClient) as unknown as DeletionRpc;
  const bucket = userClient.storage.from(PROFILE_PHOTO_BUCKET);
  return {
    preview: async (profileId) => rpcResult<DeletionPreviewRow[]>(await rpc("preview_member_deletion", { p_profile_id: profileId })),
    prepare: async (args) => rpcResult<PreparedDeletionRow[]>(await rpc("prepare_member_deletion", args)),
    finalize: async (args) => rpcResult<FinalizedDeletionRow[]>(await rpc("finalize_member_deletion", args)),
    listPersonalFiles: async (profileId) => {
      const paths: string[] = [];
      for (let offset = 0; ; offset += 100) {
        const page = await bucket.list(profileId, { limit: 100, offset });
        if (page.error) return { paths: [], error: { message: page.error.message } };
        const files = page.data ?? [];
        for (const file of files) {
          if (file.id === null) return { paths: [], error: { message: "Unexpected nested personal file" } };
          paths.push(`${profileId}/${file.name}`);
        }
        if (files.length < 100) break;
      }
      return { paths, error: null };
    },
    removePersonalFiles: async (paths) => {
      const result = await bucket.remove(paths);
      return { error: result.error ? { message: result.error.message } : null };
    },
    deleteAuthUser: async (authUserId, softDelete) => {
      const result = await adminClient.auth.admin.deleteUser(authUserId, softDelete);
      return { error: result.error ? { status: result.error.status, message: result.error.message } : null };
    },
  };
}

export async function authorizeMemberDeletionClient(request: Request): Promise<MemberDeletionClient> {
  const { userClient, adminClient } = await requireAuthenticatedUser(request);
  return createMemberDeletionProductionClient(userClient, adminClient);
}
