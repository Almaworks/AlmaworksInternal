import { requireSemesterAdmin } from "@/src/auth/server";
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
    const { userClient } = await requireSemesterAdmin(request, body.semesterId);
    const bundleResult = await userClient.rpc("upsert_outreach_contact_bundle", {
      p_semester_id: body.semesterId,
      p_full_name: body.fullName,
      p_email: body.email ?? undefined,
      p_linkedin_url: body.linkedinUrl ?? undefined,
      p_phone: body.phone ?? undefined,
      p_biography: body.biography ?? undefined,
      p_company_name: body.companyName ?? undefined,
      p_company_normalized_name: body.companyName?.toLowerCase() ?? undefined,
      p_company_domain: body.companyDomain ?? undefined,
      p_company_title: body.title ?? undefined,
    }).single();
    if (bundleResult.error !== null || bundleResult.data === null) {
      if (bundleResult.error?.message.includes("outreach_company_identity_conflict")) {
        throw new OutreachHttpError(409, "duplicate_record", "Company details conflict with an existing outreach record.");
      }
      if (bundleResult.error?.code === "23505") throw new OutreachHttpError(409, "duplicate_record", "A contact with that email or LinkedIn URL already exists.");
      throw new OutreachHttpError(400, "database_error", bundleResult.error?.message ?? "Contact could not be created.");
    }

    const [contactResult, opportunityResult, companyResult] = await Promise.all([
      userClient.from("outreach_contacts").select("id, full_name, email, linkedin_url, phone, biography, expertise_tags, notes, created_at, updated_at").eq("id", bundleResult.data.contact_id).single(),
      userClient.from("outreach_opportunities").select("id, semester_id, contact_id, stage, cadence_days, next_follow_up_at, owner_profile_id, priority, created_at, updated_at").eq("id", bundleResult.data.opportunity_id).single(),
      bundleResult.data.company_id === null
        ? Promise.resolve({ data: null, error: null })
        : userClient.from("outreach_companies").select("*").eq("id", bundleResult.data.company_id).single(),
    ]);
    if (contactResult.error !== null || contactResult.data === null) throw new OutreachHttpError(400, "database_error", contactResult.error?.message ?? "Contact could not be loaded.");
    if (opportunityResult.error !== null || opportunityResult.data === null) throw new OutreachHttpError(400, "database_error", opportunityResult.error?.message ?? "Opportunity could not be loaded.");
    if (companyResult.error !== null) throw new OutreachHttpError(400, "database_error", companyResult.error.message);
    return { contact: contactResult.data, company: companyResult.data, opportunity: opportunityResult.data };
  }, 201);
}
