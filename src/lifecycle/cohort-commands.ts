export interface CohortRpcError {
  code?: string;
  message: string;
}

interface RpcResponse<T> {
  data: T | null;
  error: CohortRpcError | null;
}

export interface BulkLifecycleRpcClient {
  bulkSetMembershipActivity(args: {
    p_semester_id: string;
    p_membership_ids: string[];
    p_is_active: boolean;
  }): Promise<RpcResponse<number>>;
}

export interface ImportMembershipsRpcClient {
  importPriorMemberships(args: {
    p_source_semester_id: string;
    p_target_semester_id: string;
    p_membership_ids: string[] | null;
  }): Promise<RpcResponse<readonly {
    imported_count: number;
    skipped_count: number;
    source_count: number;
  }[]>>;
}

type AuthorizeBulk = (
  request: Request,
  semesterId: string,
) => Promise<BulkLifecycleRpcClient>;

type AuthorizeImport = (
  request: Request,
  semesterId: string,
) => Promise<ImportMembershipsRpcClient>;

export class CohortCommandError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "CohortCommandError";
    this.code = code;
  }
}

export function createBulkSetMembershipActivityCommand(authorize: AuthorizeBulk) {
  return async function bulkSetMembershipActivity(input: {
    request: Request;
    semesterId: string;
    membershipIds: string[];
    activity: "active" | "inactive";
  }) {
    const client = await authorize(input.request, input.semesterId);
    const { data, error } = await client.bulkSetMembershipActivity({
      p_semester_id: input.semesterId,
      p_membership_ids: input.membershipIds,
      p_is_active: input.activity === "active",
    });
    if (error !== null) throw new CohortCommandError(error.message, error.code);
    if (data === null || data !== input.membershipIds.length) {
      throw new CohortCommandError(
        `Bulk lifecycle change changed ${data ?? 0} of ${input.membershipIds.length} selected memberships.`,
        "partial_update",
      );
    }
    return {
      updated: data,
      status: input.activity === "active" ? "active" as const : "suspended" as const,
    };
  };
}

export function createImportPriorMembershipsCommand(authorize: AuthorizeImport) {
  return async function importPriorMemberships(input: {
    request: Request;
    sourceSemesterId: string;
    targetSemesterId: string;
    membershipIds: string[] | null;
  }) {
    await authorize(input.request, input.sourceSemesterId);
    const client = await authorize(input.request, input.targetSemesterId);
    const { data, error } = await client.importPriorMemberships({
      p_source_semester_id: input.sourceSemesterId,
      p_target_semester_id: input.targetSemesterId,
      p_membership_ids: input.membershipIds,
    });
    if (error !== null) throw new CohortCommandError(error.message, error.code);
    if (data === null || data.length !== 1) {
      throw new CohortCommandError("Prior-cohort import returned an invalid result.");
    }
    const row = data[0];
    return {
      imported: row.imported_count,
      skipped: row.skipped_count,
      source: row.source_count,
    };
  };
}
