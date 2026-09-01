import { requireSemesterAdmin } from "../../auth/server.ts";
import type { Database } from "../../db/types.ts";
import type { UpdateContactBody } from "./http.ts";
import type { ArchiveContactBody } from "./http.ts";

export interface ContactUpdateRow {
  id: string;
  full_name: string;
  email: string | null;
  linkedin_url: string | null;
  phone: string | null;
  biography: string | null;
  expertise_tags: readonly string[];
  notes: string | null;
  updated_at: string;
}

export interface ContactUpdateClient {
  updateContact(input: {
    contactId: string;
    expectedUpdatedAt: string;
    changes: UpdateContactBody["changes"];
  }): Promise<{ data: ContactUpdateRow | null; error: { code?: string; message: string } | null }>;
}

export type AuthorizeContactUpdate = (
  request: Request,
  semesterId: string,
) => Promise<ContactUpdateClient>;

export interface OutreachContact {
  id: string;
  fullName: string;
  email: string | null;
  linkedinUrl: string | null;
  phone: string | null;
  biography: string | null;
  expertiseTags: readonly string[];
  notes: string | null;
  updatedAt: string;
}

export type UpdateContactResult =
  | { ok: true; value: OutreachContact }
  | { ok: false; error: { kind: "conflict"; code: "stale_updated_at"; message: string } };

function mapContact(row: ContactUpdateRow): OutreachContact {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    linkedinUrl: row.linkedin_url,
    phone: row.phone,
    biography: row.biography,
    expertiseTags: row.expertise_tags,
    notes: row.notes,
    updatedAt: row.updated_at,
  };
}

export function createUpdateOutreachContactCommand(authorize: AuthorizeContactUpdate) {
  return async function updateOutreachContact(
    input: UpdateContactBody & { request: Request },
  ): Promise<UpdateContactResult> {
    const client = await authorize(input.request, input.semesterId);
    const result = await client.updateContact({
      contactId: input.contactId,
      expectedUpdatedAt: input.updatedAt,
      changes: input.changes,
    });
    if (result.error !== null) throw new Error(result.error.message);
    if (result.data === null) {
      return {
        ok: false,
        error: {
          kind: "conflict",
          code: "stale_updated_at",
          message: "Outreach contact changed after it was loaded.",
        },
      };
    }
    return { ok: true, value: mapContact(result.data) };
  };
}

const authorizeWithServerContext: AuthorizeContactUpdate = async (request, semesterId) => {
  const { userClient } = await requireSemesterAdmin(request, semesterId);
  return {
    updateContact: async ({ contactId, expectedUpdatedAt, changes }) => {
      const update: Database["public"]["Tables"]["outreach_contacts"]["Update"] = {};
      if (changes.fullName !== undefined) update.full_name = changes.fullName;
      if (changes.email !== undefined) update.email = changes.email;
      if (changes.linkedinUrl !== undefined) update.linkedin_url = changes.linkedinUrl;
      if (changes.phone !== undefined) update.phone = changes.phone;
      if (changes.biography !== undefined) update.biography = changes.biography;
      if (changes.expertiseTags !== undefined) update.expertise_tags = [...changes.expertiseTags];
      if (changes.notes !== undefined) update.notes = changes.notes;
      return await userClient
        .from("outreach_contacts")
        .update(update)
        .eq("id", contactId)
        .eq("updated_at", expectedUpdatedAt)
        .select("id, full_name, email, linkedin_url, phone, biography, expertise_tags, notes, updated_at")
        .maybeSingle();
    },
  };
};

export const updateOutreachContact = createUpdateOutreachContactCommand(authorizeWithServerContext);

interface ContactArchiveRow { id: string }
interface ContactArchiveError { message: string }

export interface ContactArchiveClient {
  archiveSemester(input: {
    semesterId: string;
    opportunityId: string;
    contactId: string;
    expectedUpdatedAt: string;
  }): Promise<{ data: ContactArchiveRow | null; error: ContactArchiveError | null }>;
  archiveGlobal(input: {
    contactId: string;
    expectedUpdatedAt: string;
  }): Promise<{ data: ContactArchiveRow | null; error: ContactArchiveError | null }>;
}

export type AuthorizeContactArchive = (
  request: Request,
  semesterId: string,
) => Promise<ContactArchiveClient>;

export type ArchiveContactResult =
  | { ok: true; value: { scope: "semester" | "global"; semesterId: string; opportunityId: string; contactId: string } }
  | { ok: false; error: { kind: "conflict"; code: "stale_updated_at"; message: string } };

export function createArchiveOutreachContactCommand(authorize: AuthorizeContactArchive) {
  return async function archiveOutreachContact(
    input: ArchiveContactBody & { request: Request },
  ): Promise<ArchiveContactResult> {
    const client = await authorize(input.request, input.semesterId);
    const result = input.scope === "semester"
      ? await client.archiveSemester({
        semesterId: input.semesterId,
        opportunityId: input.opportunityId,
        contactId: input.contactId,
        expectedUpdatedAt: input.updatedAt,
      })
      : await client.archiveGlobal({
        contactId: input.contactId,
        expectedUpdatedAt: input.updatedAt,
      });
    if (result.error !== null) throw new Error(result.error.message);
    if (result.data === null) {
      return {
        ok: false,
        error: {
          kind: "conflict",
          code: "stale_updated_at",
          message: "Outreach contact changed after it was loaded.",
        },
      };
    }
    return {
      ok: true,
      value: {
        scope: input.scope,
        semesterId: input.semesterId,
        opportunityId: input.opportunityId,
        contactId: input.contactId,
      },
    };
  };
}

const authorizeArchiveWithServerContext: AuthorizeContactArchive = async (request, semesterId) => {
  const { userClient } = await requireSemesterAdmin(request, semesterId);
  const archivedAt = () => new Date().toISOString();
  return {
    archiveSemester: async ({ semesterId: scopedSemesterId, opportunityId, contactId, expectedUpdatedAt }) => await userClient
      .from("outreach_opportunities")
      .update({ archived_at: archivedAt() })
      .eq("semester_id", scopedSemesterId)
      .eq("id", opportunityId)
      .eq("contact_id", contactId)
      .eq("updated_at", expectedUpdatedAt)
      .is("archived_at", null)
      .select("id")
      .maybeSingle(),
    archiveGlobal: async ({ contactId, expectedUpdatedAt }) => await userClient
      .from("outreach_contacts")
      .update({ archived_at: archivedAt() })
      .eq("id", contactId)
      .eq("updated_at", expectedUpdatedAt)
      .is("archived_at", null)
      .select("id")
      .maybeSingle(),
  };
};

export const archiveOutreachContact = createArchiveOutreachContactCommand(authorizeArchiveWithServerContext);
