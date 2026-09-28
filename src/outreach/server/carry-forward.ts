import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AuthorizationError,
  requireSemesterAdmin,
} from "../../auth/server.ts";
import type { Database } from "../../db/types.ts";
import { OutreachHttpError } from "./http.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const MAX_CONTACTS = 250;

type DatabaseError = { code?: string; message: string };

type QueryResult<T> = {
  data: T | null;
  error: DatabaseError | null;
};

export interface CarryForwardBody {
  sourceSemesterId: string;
  targetSemesterId: string;
  contactIds: readonly string[];
}

export interface CarryForwardResult {
  addedCount: number;
  skippedCount: number;
  targetSemesterId: string;
}

export interface CarryForwardDatabase {
  loadSemester(semesterId: string): Promise<QueryResult<{ id: string; is_active: boolean }>>;
  carryForward(args: {
    p_source_semester_id: string;
    p_target_semester_id: string;
    p_contact_ids: readonly string[];
  }): Promise<QueryResult<number>>;
}

export type AuthorizeCarryForwardSemester = (
  request: Request,
  semesterId: string,
) => Promise<CarryForwardDatabase>;

function validation(field: string | undefined, message: string): never {
  throw new OutreachHttpError(400, "validation_error", message, field);
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new OutreachHttpError(400, "invalid_json", "Request body must be a valid JSON object.");
  }
  return value as Record<string, unknown>;
}

function uuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    return validation(field, `${field} must be a valid UUID.`);
  }
  return value.trim().toLowerCase();
}

export function parseCarryForwardBody(value: unknown): CarryForwardBody {
  const body = object(value);
  const sourceSemesterId = uuid(body.sourceSemesterId, "sourceSemesterId");
  const targetSemesterId = uuid(body.targetSemesterId, "targetSemesterId");

  if (sourceSemesterId === targetSemesterId) {
    validation("targetSemesterId", "targetSemesterId must differ from sourceSemesterId.");
  }
  if (!Array.isArray(body.contactIds) || body.contactIds.length < 1 || body.contactIds.length > MAX_CONTACTS) {
    validation("contactIds", `contactIds must contain between 1 and ${MAX_CONTACTS} UUIDs.`);
  }

  const seen = new Set<string>();
  const contactIds = body.contactIds.map((value, index) => {
    const contactId = uuid(value, `contactIds[${index}]`);
    if (seen.has(contactId)) {
      validation(`contactIds[${index}]`, "contactIds must not contain duplicates.");
    }
    seen.add(contactId);
    return contactId;
  });

  return { sourceSemesterId, targetSemesterId, contactIds };
}

function productionDatabase(client: SupabaseClient<Database>): CarryForwardDatabase {
  return {
    loadSemester: async (semesterId) => await client
      .from("semesters")
      .select("id, is_active")
      .eq("id", semesterId)
      .maybeSingle(),
    carryForward: async (args) => await client.rpc("carry_forward_outreach_contacts", {
      p_source_semester_id: args.p_source_semester_id,
      p_target_semester_id: args.p_target_semester_id,
      p_contact_ids: [...args.p_contact_ids],
    }),
  };
}

const authorizeWithRls: AuthorizeCarryForwardSemester = async (request, semesterId) => {
  const { userClient } = await requireSemesterAdmin(request, semesterId);
  return productionDatabase(userClient);
};

export function createCarryForwardOutreachContacts(authorize: AuthorizeCarryForwardSemester) {
  return async function carryForwardOutreachContacts(input: CarryForwardBody & { request: Request }): Promise<CarryForwardResult> {
    const database = await authorize(input.request, input.sourceSemesterId);
    await authorize(input.request, input.targetSemesterId);

    const target = await database.loadSemester(input.targetSemesterId);
    if (target.error !== null) {
      throw new Error(`Target semester could not be loaded: ${target.error.message}`);
    }
    if (target.data === null) {
      throw new OutreachHttpError(404, "not_found", "Target semester was not found.");
    }
    if (!target.data.is_active) {
      throw new OutreachHttpError(409, "inactive_semester", "Target semester must be the active semester.");
    }

    const result = await database.carryForward({
      p_source_semester_id: input.sourceSemesterId,
      p_target_semester_id: input.targetSemesterId,
      p_contact_ids: input.contactIds,
    });
    if (result.error !== null) {
      if (result.error.code === "42501" || /not authorized/iu.test(result.error.message)) {
        throw new AuthorizationError("Semester administrator access required for both semesters.", 403);
      }
      throw new Error(`Outreach contacts could not be carried forward: ${result.error.message}`);
    }
    if (
      result.data === null
      || !Number.isInteger(result.data)
      || result.data < 0
      || result.data > input.contactIds.length
    ) {
      throw new Error("Carry-forward RPC returned an invalid inserted count.");
    }

    return {
      addedCount: result.data,
      skippedCount: input.contactIds.length - result.data,
      targetSemesterId: input.targetSemesterId,
    };
  };
}

export const carryForwardOutreachContacts = createCarryForwardOutreachContacts(authorizeWithRls);
