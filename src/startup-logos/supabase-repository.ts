import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../db/types.ts";
import { StartupLogoError, type StartupLogoRepository, type StartupLogoState } from "./startup-logos.ts";
import { STARTUP_LOGO_BUCKET, STARTUP_LOGO_URL_TTL_SECONDS } from "./urls.ts";

type RlsClient = SupabaseClient<Database>;
type DbError = { code?: string; statusCode?: string | number; message: string } | null;

export class StartupLogoUnavailableError extends Error {
  readonly status = 503;

  constructor() {
    super("Startup logos are temporarily unavailable. Please try again after the logo setup is deployed.");
    this.name = "StartupLogoUnavailableError";
  }
}

function ensure(error: DbError): void {
  if (!error) return;
  if (["42703", "42P01", "PGRST204", "PGRST205"].includes(error.code ?? "")) {
    throw new StartupLogoUnavailableError();
  }
  throw new Error(error.message);
}

function ensureStorage(error: DbError): void {
  if (error && (error.statusCode === "404" || error.statusCode === 404 ||
    error.code === "NoSuchBucket" || /bucket not found/iu.test(error.message))) {
    throw new StartupLogoUnavailableError();
  }
  ensure(error);
}

const ineligible: StartupLogoState = {
  eligible: false,
  organizationId: null,
  logoPath: null,
  legacyLogoUrl: null,
  companyName: null,
};

export function createSupabaseStartupLogoRepository(client: RlsClient): StartupLogoRepository {
  return {
    loadForProfile: async (profileId) => {
      const semesters = await client.from("semesters").select("id").eq("is_active", true).limit(2);
      ensure(semesters.error);
      if (!semesters.data?.length) return ineligible;
      if (semesters.data.length !== 1) throw new StartupLogoError("The active semester assignment is ambiguous.", 409);
      const semesterId = semesters.data[0].id;

      const memberships = await client.from("semester_memberships")
        .select("id")
        .eq("profile_id", profileId)
        .eq("semester_id", semesterId)
        .eq("role", "startup")
        .in("status", ["onboarding", "active"])
        .limit(2);
      ensure(memberships.error);
      if (!memberships.data?.length) return ineligible;
      if (memberships.data.length !== 1) throw new StartupLogoError("The startup membership assignment is ambiguous.", 409);

      const teams = await client.from("startup_team_memberships")
        .select("startup_semester_id")
        .eq("semester_id", semesterId)
        .eq("semester_membership_id", memberships.data[0].id)
        .limit(2);
      ensure(teams.error);
      if (!teams.data?.length) return ineligible;
      if (teams.data.length !== 1) throw new StartupLogoError("The startup team assignment is ambiguous.", 409);

      const startups = await client.from("startup_semesters")
        .select("startup_organization_id")
        .eq("id", teams.data[0].startup_semester_id)
        .eq("semester_id", semesterId)
        .limit(2);
      ensure(startups.error);
      if (!startups.data?.length) return ineligible;
      if (startups.data.length !== 1) throw new StartupLogoError("The startup organization assignment is ambiguous.", 409);

      const organizationId = startups.data[0].startup_organization_id;
      const organization = await client.from("startup_organizations")
        .select("id,name,logo_path,logo_url")
        .eq("id", organizationId)
        .maybeSingle();
      ensure(organization.error);
      if (!organization.data) return ineligible;
      return {
        eligible: true,
        organizationId,
        companyName: organization.data.name,
        logoPath: organization.data.logo_path,
        legacyLogoUrl: organization.data.logo_url,
      };
    },
    upload: async (path, file) => {
      const result = await client.storage.from(STARTUP_LOGO_BUCKET).upload(path, file, {
        cacheControl: "31536000",
        contentType: file.type,
        upsert: false,
      });
      ensureStorage(result.error);
    },
    sign: async (path) => {
      const result = await client.storage.from(STARTUP_LOGO_BUCKET)
        .createSignedUrl(path, STARTUP_LOGO_URL_TTL_SECONDS);
      ensureStorage(result.error);
      if (!result.data?.signedUrl) throw new Error("Startup logo URL could not be created.");
      return result.data.signedUrl;
    },
    replacePath: async (organizationId, expectedPath, nextPath) => {
      let query = client.from("startup_organizations")
        .update({ logo_path: nextPath, logo_url: null })
        .eq("id", organizationId);
      query = expectedPath === null ? query.is("logo_path", null) : query.eq("logo_path", expectedPath);
      const result = await query.select("id").maybeSingle();
      ensure(result.error);
      return result.data?.id === organizationId;
    },
    remove: async (paths) => {
      if (paths.length === 0) return;
      const result = await client.storage.from(STARTUP_LOGO_BUCKET).remove(paths);
      ensureStorage(result.error);
    },
  };
}
