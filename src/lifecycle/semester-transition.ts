import type { Json } from "../db/types.ts";

export interface SemesterConfiguration {
  location: string;
  sessionCadence: "weekly";
  defaultFormat: "online" | "in-person";
}

export interface CreateSemesterDraftInput {
  sourceSemesterId: string;
  name: string;
  startDate: string;
  endDate: string;
  configuration: SemesterConfiguration;
}

export interface ActivateSemesterInput {
  sourceSemesterId: string;
  targetSemesterId: string;
  closeAcknowledged: boolean;
}

export interface ReviewableMeetingDate {
  date: string;
  label: string;
  included: boolean;
}

export interface ReplaceMeetingsInput {
  semesterId: string;
  dates: { date: string; label: string }[];
}

interface RpcError {
  code?: string;
  message: string;
}

interface RpcResponse<T> {
  data: T | null;
  error: RpcError | null;
}

export interface SemesterTransitionRpcClient {
  createSemesterDraft(args: {
    p_source_semester_id: string;
    p_name: string;
    p_start_date: string;
    p_end_date: string;
    p_configuration: Json;
  }): Promise<RpcResponse<readonly { semester_id: string; semester_name: string }[]>>;
  activateSemester(args: {
    p_source_semester_id: string;
    p_target_semester_id: string;
  }): Promise<RpcResponse<readonly {
    closed_semester_id: string;
    active_semester_id: string;
    alumni_count: number;
  }[]>>;
  replaceMeetings(args: {
    p_semester_id: string;
    p_meetings: Json;
  }): Promise<RpcResponse<number>>;
}

type AuthorizeTransition<TMethod extends keyof SemesterTransitionRpcClient> = (
  request: Request,
  semesterId: string,
) => Promise<Pick<SemesterTransitionRpcClient, TMethod>>;

export class SemesterTransitionError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "SemesterTransitionError";
    this.code = code;
  }
}

function objectInput(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new SemesterTransitionError("Request body is required.", "validation_error");
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SemesterTransitionError(`${field} is required.`, "validation_error");
  }
  return value.trim();
}

function isoDate(value: unknown, field: string): string {
  const date = requiredText(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new SemesterTransitionError(`${field} must be a valid date.`, "validation_error");
  }
  return date;
}

export function parseCreateSemesterDraftRequest(value: unknown): CreateSemesterDraftInput {
  const input = objectInput(value);
  const startDate = isoDate(input.startDate, "startDate");
  const endDate = isoDate(input.endDate, "endDate");
  if (endDate <= startDate) {
    throw new SemesterTransitionError("endDate must be after startDate.", "validation_error");
  }
  if (input.sessionCadence !== "weekly") {
    throw new SemesterTransitionError("sessionCadence must be weekly.", "validation_error");
  }
  if (!(["online", "in-person"] as const).includes(input.defaultFormat as "online" | "in-person")) {
    throw new SemesterTransitionError("defaultFormat is invalid.", "validation_error");
  }
  return {
    sourceSemesterId: requiredText(input.sourceSemesterId, "sourceSemesterId"),
    name: requiredText(input.name, "name"),
    startDate,
    endDate,
    configuration: {
      location: requiredText(input.location, "location"),
      sessionCadence: input.sessionCadence,
      defaultFormat: input.defaultFormat as SemesterConfiguration["defaultFormat"],
    },
  };
}

export function parseActivateSemesterRequest(value: unknown): ActivateSemesterInput {
  const input = objectInput(value);
  const sourceSemesterId = requiredText(input.sourceSemesterId, "sourceSemesterId");
  const targetSemesterId = requiredText(input.targetSemesterId, "targetSemesterId");
  if (sourceSemesterId === targetSemesterId) {
    throw new SemesterTransitionError("Source and target semesters must differ.", "validation_error");
  }
  if (input.closeAcknowledged !== true) {
    throw new SemesterTransitionError(
      "You must acknowledge closing the current semester.",
      "validation_error",
    );
  }
  return { sourceSemesterId, targetSemesterId, closeAcknowledged: true };
}

export function buildWeeklyMeetingDates(
  firstMeetingDate: string,
  semesterEndDate: string,
): ReviewableMeetingDate[] {
  const first = isoDate(firstMeetingDate, "firstMeetingDate");
  const end = isoDate(semesterEndDate, "semesterEndDate");
  if (end < first) {
    throw new SemesterTransitionError(
      "semesterEndDate must not be before firstMeetingDate.",
      "validation_error",
    );
  }
  const dates: ReviewableMeetingDate[] = [];
  const cursor = new Date(`${first}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last && dates.length < 30) {
    const date = cursor.toISOString().slice(0, 10);
    dates.push({
      date,
      label: cursor.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
      included: true,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return dates;
}

export function parseReplaceMeetingsRequest(value: unknown): ReplaceMeetingsInput {
  const input = objectInput(value);
  const semesterId = requiredText(input.semesterId, "semesterId");
  if (!Array.isArray(input.dates) || input.dates.length < 1 || input.dates.length > 30) {
    throw new SemesterTransitionError(
      "dates must contain between 1 and 30 proposed weeks.",
      "validation_error",
    );
  }
  const dates = input.dates.flatMap((raw, index) => {
    const item = objectInput(raw);
    if (item.included === false) return [];
    return [{
      date: isoDate(item.date, `dates[${index}].date`),
      label: requiredText(item.label, `dates[${index}].label`),
    }];
  });
  if (dates.length === 0) {
    throw new SemesterTransitionError("At least one meeting date is required.", "validation_error");
  }
  if (new Set(dates.map((item) => item.date)).size !== dates.length) {
    throw new SemesterTransitionError("Meeting dates must be unique.", "validation_error");
  }
  return { semesterId, dates };
}

export function createSemesterDraftCommand(authorize: AuthorizeTransition<"createSemesterDraft">) {
  return async function createDraft(input: CreateSemesterDraftInput & { request: Request }) {
    const client = await authorize(input.request, input.sourceSemesterId);
    const { data, error } = await client.createSemesterDraft({
      p_configuration: {
        location: input.configuration.location,
        sessionCadence: input.configuration.sessionCadence,
        defaultFormat: input.configuration.defaultFormat,
      },
      p_end_date: input.endDate,
      p_name: input.name,
      p_source_semester_id: input.sourceSemesterId,
      p_start_date: input.startDate,
    });
    if (error !== null) throw new SemesterTransitionError(error.message, error.code);
    if (data === null || data.length !== 1) {
      throw new SemesterTransitionError("Semester draft creation returned an invalid result.");
    }
    return { id: data[0].semester_id, name: data[0].semester_name, status: "draft" as const };
  };
}

export function createActivateSemesterCommand(authorize: AuthorizeTransition<"activateSemester">) {
  return async function activate(input: ActivateSemesterInput & { request: Request }) {
    const sourceClient = await authorize(input.request, input.sourceSemesterId);
    await authorize(input.request, input.targetSemesterId);
    const { data, error } = await sourceClient.activateSemester({
      p_source_semester_id: input.sourceSemesterId,
      p_target_semester_id: input.targetSemesterId,
    });
    if (error !== null) throw new SemesterTransitionError(error.message, error.code);
    if (data === null || data.length !== 1) {
      throw new SemesterTransitionError("Semester activation returned an invalid result.");
    }
    return {
      closedSemesterId: data[0].closed_semester_id,
      activeSemesterId: data[0].active_semester_id,
      alumniCount: data[0].alumni_count,
    };
  };
}

export function createReplaceMeetingsCommand(authorize: AuthorizeTransition<"replaceMeetings">) {
  return async function replaceMeetings(input: ReplaceMeetingsInput & { request: Request }) {
    const client = await authorize(input.request, input.semesterId);
    const { data, error } = await client.replaceMeetings({
      p_meetings: input.dates,
      p_semester_id: input.semesterId,
    });
    if (error !== null) throw new SemesterTransitionError(error.message, error.code);
    if (data === null || data !== input.dates.length) {
      throw new SemesterTransitionError("Meeting replacement returned an invalid result.");
    }
    return { saved: data };
  };
}
