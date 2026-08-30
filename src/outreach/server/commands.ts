import { requireSemesterAdmin } from "../../auth/server.ts";
import type { Database, Json } from "../../db/types.ts";
import type {
  ActivityKind,
  OutreachChannel,
  OutreachStage,
} from "../types.ts";

type DatabaseFunctions = Database["public"]["Functions"];
type RpcArgs<Name extends keyof DatabaseFunctions> = DatabaseFunctions[Name]["Args"];
type RpcReturns<Name extends keyof DatabaseFunctions> = DatabaseFunctions[Name]["Returns"];
type ActivityRow = RpcReturns<"log_outreach_activity">;
type OpportunityRow = RpcReturns<"set_outreach_snooze">;
type ReleaseRow = RpcReturns<"release_inactive_owner_work">[number];
type TransferOwnerArgs = Omit<
  RpcArgs<"transfer_outreach_owner">,
  "p_new_owner_profile_id"
> & { p_new_owner_profile_id: string | null };
type SnoozeOpportunityArgs = Omit<
  RpcArgs<"set_outreach_snooze">,
  "p_snoozed_until"
> & { p_snoozed_until: string | null };

export interface OutreachRpcError {
  code?: string;
  message: string;
}

export interface OutreachRpcResponse<T> {
  data: T | null;
  error: OutreachRpcError | null;
}

export interface OutreachCommandRpcClient {
  checkActiveOwner(
    semesterId: string,
    profileId: string,
  ): Promise<OutreachRpcResponse<boolean>>;
  logActivity(
    args: RpcArgs<"log_outreach_activity">,
  ): Promise<OutreachRpcResponse<ActivityRow>>;
  transferOwner(
    args: TransferOwnerArgs,
  ): Promise<OutreachRpcResponse<OpportunityRow>>;
  snoozeOpportunity(
    args: SnoozeOpportunityArgs,
  ): Promise<OutreachRpcResponse<OpportunityRow>>;
  silenceOpportunity(
    args: RpcArgs<"set_outreach_silence">,
  ): Promise<OutreachRpcResponse<OpportunityRow>>;
  releaseInactiveOwnerWork(
    args: RpcArgs<"release_inactive_owner_work">,
  ): Promise<OutreachRpcResponse<ReleaseRow[]>>;
}

export type AuthorizeOutreachCommand = (
  request: Request,
  semesterId: string,
) => Promise<OutreachCommandRpcClient>;

interface CommandContext {
  request: Request;
  semesterId: string;
}

interface OpportunityCommandContext extends CommandContext {
  opportunityId: string;
  updatedAt: string;
}

interface ActivityInputBase extends OpportunityCommandContext {
  occurredAt: string;
  summary?: string;
  details?: Json;
  nextFollowUpAt?: string;
  stage?: OutreachStage;
}

interface EmailActivityInput extends ActivityInputBase {
  activityKind: "email";
  channel: "email";
}

interface CallActivityInput extends ActivityInputBase {
  activityKind: "call";
  channel: OutreachChannel;
}

interface LinkedInActivityInput extends ActivityInputBase {
  activityKind: "linkedin";
  channel: "linkedin";
}

interface MeetingActivityInput extends ActivityInputBase {
  activityKind: "meeting";
  channel?: OutreachChannel;
}

interface ReplyActivityInput extends ActivityInputBase {
  activityKind: "reply";
  channel?: OutreachChannel;
}

interface NoteActivityInput extends ActivityInputBase {
  activityKind: "note";
  channel?: never;
}

export type LogActivityInput =
  | EmailActivityInput
  | CallActivityInput
  | LinkedInActivityInput
  | MeetingActivityInput
  | ReplyActivityInput
  | NoteActivityInput;

export interface TransferOwnerInput extends OpportunityCommandContext {
  newOwnerProfileId: string | null;
  reason?: string;
}

export interface SnoozeOpportunityInput extends OpportunityCommandContext {
  snoozedUntil: string | null;
  reason?: string;
}

export interface ChangeStageInput extends OpportunityCommandContext {
  stage: OutreachStage;
}

interface SilenceOpportunityInput extends OpportunityCommandContext {
  silence: true;
  reason: string;
  nextFollowUpAt?: never;
}

interface RestoreOpportunityInput extends OpportunityCommandContext {
  silence: false;
  reason?: string;
  nextFollowUpAt: string;
}

export type SetSilenceInput = SilenceOpportunityInput | RestoreOpportunityInput;

export interface ReleaseInactiveOwnerWorkInput extends CommandContext {
  ownerProfileId: string;
}

export interface OutreachActivity {
  id: string;
  semesterId: string;
  opportunityId: string;
  activityKind: ActivityKind;
  channel: OutreachChannel | null;
  occurredAt: string;
  summary: string | null;
  actorProfileId: string | null;
}

export interface OutreachOpportunityMutation {
  id: string;
  semesterId: string;
  ownerProfileId: string | null;
  stage: OutreachStage;
  nextFollowUpAt: string | null;
  snoozedUntil: string | null;
  isSilenced: boolean;
  silenceReason: string | null;
  updatedAt: string;
}

export interface ReleasedOwnerWork {
  opportunityIds: readonly string[];
}

export interface OutreachCommandConflict {
  kind: "conflict";
  code: "stale_updated_at";
  message: string;
}

export type OutreachCommandResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: OutreachCommandConflict };

export class OutreachCommandValidationError extends Error {
  readonly name = "OutreachCommandValidationError";
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.field = field;
  }
}

export class OutreachCommandDatabaseError extends Error {
  readonly name = "OutreachCommandDatabaseError";
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

function assertRequiredText(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new OutreachCommandValidationError(field, `${field} is required.`);
  }
}

function assertIsoTimestamp(value: unknown, field: string): asserts value is string {
  if (
    typeof value !== "string"
    || !/(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    || Number.isNaN(Date.parse(value))
  ) {
    throw new OutreachCommandValidationError(
      field,
      `${field} must be a valid ISO timestamp with an explicit timezone.`,
    );
  }
}

function validateContext(input: CommandContext): void {
  assertRequiredText(input.semesterId, "semesterId");
}

function validateOpportunityContext(input: OpportunityCommandContext): void {
  validateContext(input);
  assertRequiredText(input.opportunityId, "opportunityId");
  assertIsoTimestamp(input.updatedAt, "updatedAt");
}

function validateActivity(input: LogActivityInput): void {
  validateOpportunityContext(input);
  assertIsoTimestamp(input.occurredAt, "occurredAt");
  if (input.nextFollowUpAt !== undefined) {
    assertIsoTimestamp(input.nextFollowUpAt, "nextFollowUpAt");
  }

  if (
    input.activityKind === "email"
    || input.activityKind === "call"
    || input.activityKind === "linkedin"
  ) {
    assertRequiredText(input.channel, "channel");
  }
  if (input.activityKind === "email" && input.channel !== "email") {
    throw new OutreachCommandValidationError(
      "channel",
      "Email activities must use the email channel.",
    );
  }
  if (input.activityKind === "linkedin" && input.channel !== "linkedin") {
    throw new OutreachCommandValidationError(
      "channel",
      "LinkedIn activities must use the LinkedIn channel.",
    );
  }
}

function conflict(message: string): OutreachCommandResult<never> {
  return {
    ok: false,
    error: {
      kind: "conflict",
      code: "stale_updated_at",
      message,
    },
  };
}

function unwrapRpc<T>(
  response: OutreachRpcResponse<T>,
  staleMessage: string,
): OutreachCommandResult<T> {
  if (response.error?.code === "40001") {
    return conflict(staleMessage);
  }
  if (response.error !== null) {
    throw new OutreachCommandDatabaseError(response.error.message, response.error.code);
  }
  if (response.data === null) {
    throw new OutreachCommandDatabaseError("Outreach command returned no data.");
  }
  return { ok: true, value: response.data };
}

function assertSemesterBoundary(rowSemesterId: string, expectedSemesterId: string): void {
  if (rowSemesterId !== expectedSemesterId) {
    throw new OutreachCommandDatabaseError(
      "Outreach command returned data outside the authorized semester.",
    );
  }
}

function mapActivity(row: ActivityRow, expectedSemesterId: string): OutreachActivity {
  assertSemesterBoundary(row.semester_id, expectedSemesterId);
  return {
    id: row.id,
    semesterId: row.semester_id,
    opportunityId: row.opportunity_id,
    activityKind: row.activity_kind,
    channel: row.channel,
    occurredAt: row.occurred_at,
    summary: row.summary,
    actorProfileId: row.actor_profile_id,
  };
}

function mapOpportunity(
  row: OpportunityRow,
  expectedSemesterId: string,
): OutreachOpportunityMutation {
  assertSemesterBoundary(row.semester_id, expectedSemesterId);
  return {
    id: row.id,
    semesterId: row.semester_id,
    ownerProfileId: row.owner_profile_id,
    stage: row.stage,
    nextFollowUpAt: row.next_follow_up_at,
    snoozedUntil: row.snoozed_until,
    isSilenced: row.is_silenced,
    silenceReason: row.silence_reason,
    updatedAt: row.updated_at,
  };
}

function mapResult<T, U>(
  result: OutreachCommandResult<T>,
  mapper: (value: T) => U,
): OutreachCommandResult<U> {
  return result.ok ? { ok: true, value: mapper(result.value) } : result;
}

const authorizeWithServerContext: AuthorizeOutreachCommand = async (
  request,
  semesterId,
) => {
  const { userClient } = await requireSemesterAdmin(request, semesterId);

  return {
    checkActiveOwner: async (targetSemesterId, profileId) => {
      const { data, error } = await userClient
        .from("semester_memberships")
        .select("id")
        .eq("semester_id", targetSemesterId)
        .eq("profile_id", profileId)
        .eq("role", "admin")
        .eq("status", "active")
        .maybeSingle();
      return { data: data !== null, error };
    },
    logActivity: async (args) => await userClient.rpc("log_outreach_activity", args),
    // Postgres permits NULL for these function arguments, but generated
    // Supabase function types do not preserve argument nullability.
    transferOwner: async (args) => await userClient.rpc(
      "transfer_outreach_owner",
      args as RpcArgs<"transfer_outreach_owner">,
    ),
    snoozeOpportunity: async (args) => await userClient.rpc(
      "set_outreach_snooze",
      args as RpcArgs<"set_outreach_snooze">,
    ),
    silenceOpportunity: async (args) => await userClient.rpc("set_outreach_silence", args),
    releaseInactiveOwnerWork: async (args) =>
      await userClient.rpc("release_inactive_owner_work", args),
  };
};

export function createOutreachCommands(authorize: AuthorizeOutreachCommand) {
  async function logActivity(
    input: LogActivityInput,
  ): Promise<OutreachCommandResult<OutreachActivity>> {
    validateActivity(input);
    const client = await authorize(input.request, input.semesterId);
    const result = unwrapRpc(
      await client.logActivity({
        p_activity_kind: input.activityKind,
        p_channel: input.channel,
        p_details: input.details,
        p_expected_updated_at: input.updatedAt,
        p_next_follow_up_at: input.nextFollowUpAt,
        p_occurred_at: input.occurredAt,
        p_opportunity_id: input.opportunityId,
        p_stage: input.stage,
        p_summary: input.summary,
      }),
      "Outreach opportunity changed after it was loaded.",
    );
    return mapResult(result, (row) => mapActivity(row, input.semesterId));
  }

  async function transferOwner(
    input: TransferOwnerInput,
  ): Promise<OutreachCommandResult<OutreachOpportunityMutation>> {
    validateOpportunityContext(input);
    const client = await authorize(input.request, input.semesterId);
    if (input.newOwnerProfileId !== null) {
      assertRequiredText(input.newOwnerProfileId, "newOwnerProfileId");
      const ownerCheck = unwrapRpc(
        await client.checkActiveOwner(input.semesterId, input.newOwnerProfileId),
        "Owner membership changed after it was loaded.",
      );
      if (!ownerCheck.ok) return ownerCheck;
      if (!ownerCheck.value) {
        throw new OutreachCommandValidationError(
          "newOwnerProfileId",
          "The new owner must be an active administrator in this semester.",
        );
      }
    }

    const result = unwrapRpc(
      await client.transferOwner({
        p_expected_updated_at: input.updatedAt,
        p_new_owner_profile_id: input.newOwnerProfileId,
        p_opportunity_id: input.opportunityId,
        p_reason: input.reason,
      }),
      "Outreach opportunity changed after it was loaded.",
    );
    return mapResult(result, (row) => mapOpportunity(row, input.semesterId));
  }

  async function snoozeOpportunity(
    input: SnoozeOpportunityInput,
  ): Promise<OutreachCommandResult<OutreachOpportunityMutation>> {
    validateOpportunityContext(input);
    if (input.snoozedUntil !== null) {
      assertIsoTimestamp(input.snoozedUntil, "snoozedUntil");
    }
    const client = await authorize(input.request, input.semesterId);
    const result = unwrapRpc(
      await client.snoozeOpportunity({
        p_expected_updated_at: input.updatedAt,
        p_opportunity_id: input.opportunityId,
        p_reason: input.reason,
        p_snoozed_until: input.snoozedUntil,
      }),
      "Outreach opportunity changed after it was loaded.",
    );
    return mapResult(result, (row) => mapOpportunity(row, input.semesterId));
  }

  async function changeStage(
    input: ChangeStageInput,
  ): Promise<OutreachCommandResult<OutreachActivity>> {
    validateOpportunityContext(input);
    const client = await authorize(input.request, input.semesterId);
    const result = unwrapRpc(
      await client.logActivity({
        p_activity_kind: "note",
        p_details: { type: "stage_change", stage: input.stage } satisfies Json,
        p_expected_updated_at: input.updatedAt,
        p_opportunity_id: input.opportunityId,
        p_stage: input.stage,
        p_summary: `Stage changed to ${input.stage}`,
      }),
      "Outreach opportunity changed after it was loaded.",
    );
    return mapResult(result, (row) => mapActivity(row, input.semesterId));
  }

  async function silenceOpportunity(
    input: SetSilenceInput,
  ): Promise<OutreachCommandResult<OutreachOpportunityMutation>> {
    validateOpportunityContext(input);
    if (input.silence) {
      assertRequiredText(input.reason, "reason");
    } else {
      assertIsoTimestamp(input.nextFollowUpAt, "nextFollowUpAt");
    }
    const client = await authorize(input.request, input.semesterId);
    const result = unwrapRpc(
      await client.silenceOpportunity({
        p_expected_updated_at: input.updatedAt,
        p_is_silenced: input.silence,
        p_next_follow_up_at: input.silence ? undefined : input.nextFollowUpAt,
        p_opportunity_id: input.opportunityId,
        p_reason: input.silence ? input.reason.trim() : input.reason,
      }),
      "Outreach opportunity changed after it was loaded.",
    );
    return mapResult(result, (row) => mapOpportunity(row, input.semesterId));
  }

  async function releaseInactiveOwnerWork(
    input: ReleaseInactiveOwnerWorkInput,
  ): Promise<OutreachCommandResult<ReleasedOwnerWork>> {
    validateContext(input);
    assertRequiredText(input.ownerProfileId, "ownerProfileId");
    const client = await authorize(input.request, input.semesterId);
    const result = unwrapRpc(
      await client.releaseInactiveOwnerWork({
        p_owner_profile_id: input.ownerProfileId,
      }),
      "Owner membership changed after it was loaded.",
    );
    return mapResult(result, (rows) => ({
      opportunityIds: rows.map((row) => row.opportunity_id),
    }));
  }

  return {
    logActivity,
    transferOwner,
    snoozeOpportunity,
    changeStage,
    silenceOpportunity,
    releaseInactiveOwnerWork,
  };
}

const commands = createOutreachCommands(authorizeWithServerContext);

export const logActivity = commands.logActivity;
export const transferOwner = commands.transferOwner;
export const snoozeOpportunity = commands.snoozeOpportunity;
export const changeStage = commands.changeStage;
export const silenceOpportunity = commands.silenceOpportunity;
export const releaseInactiveOwnerWork = commands.releaseInactiveOwnerWork;
