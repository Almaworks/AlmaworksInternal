import { requireSemesterAdmin } from "@/src/auth/server";
import type { Database } from "@/src/db/types";
import { handleOutreachJson, OutreachHttpError } from "@/src/outreach/server/http";

type CreateContactBody = {
  semesterId: string;
  fullName: string;
  email: string | null;
  linkedinUrl: string | null;
  phone: string | null;
  biography: string | null;
  companyName: string | null;
  companyDomain: string | null;
  title: string | null;
};

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseBody(value: unknown): CreateContactBody {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new OutreachHttpError(400, "validation_error", "Request body must be an object.");
  }
  const body = value as Record<string, unknown>;
  const semesterId = text(body.semesterId);
  const fullName = text(body.fullName);
  if (semesterId === null) throw new OutreachHttpError(400, "validation_error", "semesterId is required.", "semesterId");
  if (fullName === null) throw new OutreachHttpError(400, "validation_error", "fullName is required.", "fullName");
  const email = text(body.email)?.toLowerCase() ?? null;
  if (email !== null && !/^\S+@\S+\.\S+$/u.test(email)) {
    throw new OutreachHttpError(400, "validation_error", "email must be valid.", "email");
  }
  return {
    semesterId,
    fullName,
    email,
    linkedinUrl: text(body.linkedinUrl),
    phone: text(body.phone),
    biography: text(body.biography),
    companyName: text(body.companyName),
    companyDomain: text(body.companyDomain)?.toLowerCase() ?? null,
    title: text(body.title),
  };
}

export async function POST(request: Request) {
  return await handleOutreachJson(request, parseBody, async (body) => {
    const { user, userClient } = await requireSemesterAdmin(request, body.semesterId);
    const contactInsert: Database["public"]["Tables"]["outreach_contacts"]["Insert"] = {
      full_name: body.fullName,
      email: body.email,
      linkedin_url: body.linkedinUrl,
      phone: body.phone,
      biography: body.biography,
      created_by: user.id,
    };
    const contactResult = await userClient
      .from("outreach_contacts")
      .insert(contactInsert)
      .select("id, full_name, email, linkedin_url, phone, biography, expertise_tags, notes, created_at, updated_at")
      .single();
    if (contactResult.error !== null || contactResult.data === null) {
      if (contactResult.error?.code === "23505") throw new OutreachHttpError(409, "duplicate_record", "A contact with that email or LinkedIn URL already exists.");
      throw new OutreachHttpError(400, "database_error", contactResult.error?.message ?? "Contact could not be created.");
    }

    const opportunityResult = await userClient
      .from("outreach_opportunities")
      .insert({ semester_id: body.semesterId, contact_id: contactResult.data.id, created_by: user.id })
      .select("id, semester_id, contact_id, stage, cadence_days, next_follow_up_at, owner_profile_id, priority, created_at, updated_at")
      .single();
    if (opportunityResult.error !== null || opportunityResult.data === null) {
      throw new OutreachHttpError(400, "database_error", opportunityResult.error?.message ?? "Opportunity could not be created.");
    }

    let company: Database["public"]["Tables"]["outreach_companies"]["Row"] | null = null;
    if (body.companyName !== null) {
      const companyResult = await userClient
        .from("outreach_companies")
        .insert({ name: body.companyName, normalized_name: body.companyName.toLowerCase(), domain: body.companyDomain, created_by: user.id })
        .select("*")
        .single();
      if (companyResult.error !== null || companyResult.data === null) {
        throw new OutreachHttpError(400, "database_error", companyResult.error?.message ?? "Company could not be created.");
      }
      company = companyResult.data;
      const relationshipResult = await userClient.from("outreach_contact_companies").insert({
        contact_id: contactResult.data.id,
        company_id: company.id,
        title: body.title,
        is_primary: true,
      });
      if (relationshipResult.error !== null) {
        throw new OutreachHttpError(400, "database_error", relationshipResult.error.message);
      }
    }
    return { contact: contactResult.data, company, opportunity: opportunityResult.data };
  }, 201);
}
