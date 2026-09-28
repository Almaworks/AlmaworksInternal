import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { AuthorizationError, requireAuthenticatedUserWithRls } from "@/src/auth/server";
import {
  createParticipantDashboardService,
  type ParticipantDashboardRepository,
  type ParticipantDashboardSnapshot,
  type ParticipantProfileForm,
} from "@/src/dashboard/participant-dashboard-server";
import {
  loadParticipantDashboardSnapshot,
  loadParticipantProfileUpdateSnapshot,
} from "@/src/dashboard/participant-snapshot-loader";
import type { Database } from "@/src/db/types";

type RlsClient = SupabaseClient<Database>;
type SnapshotLoader = (
  client: RlsClient,
  user: User,
  profileId: string,
) => Promise<ParticipantDashboardSnapshot>;

const PRIVATE_NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

function ensure(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function repository(
  client: RlsClient,
  user: User,
  profileId: string,
  loadSnapshot: SnapshotLoader,
): ParticipantDashboardRepository {
  return {
    load: async () => await loadSnapshot(client, user, profileId),
    updateProfile: async (targetProfileId, context, payload) => {
      const profileResult = await client.from("profiles").update(payload.profile).eq("id", targetProfileId);
      ensure(profileResult.error);
      if (context.role === "mentor" && "mentorProfile" in payload && payload.mentorProfile) {
        const result = await client.from("mentor_profiles").update(payload.mentorProfile).eq("profile_id", targetProfileId);
        ensure(result.error);
      }
      if (context.role === "startup" && "startupSemester" in payload && payload.startupSemester) {
        const team = await client.from("startup_team_memberships")
          .select("startup_semester_id")
          .eq("semester_membership_id", context.membershipId)
          .maybeSingle();
        ensure(team.error);
        if (!team.data) throw new Error("Startup team assignment is missing.");
        const result = await client.from("startup_semesters")
          .update(payload.startupSemester)
          .eq("id", team.data.startup_semester_id)
          .eq("semester_id", context.semesterId);
        ensure(result.error);
      }
    },
  };
}

async function context(
  request: Request,
  loadSnapshot: SnapshotLoader = loadParticipantDashboardSnapshot,
) {
  const auth = await requireAuthenticatedUserWithRls(request);
  return {
    auth,
    service: createParticipantDashboardService(
      repository(auth.userClient, auth.user, auth.profileId, loadSnapshot),
    ),
  };
}

export async function GET(request: Request) {
  try {
    const { auth, service } = await context(request);
    return NextResponse.json(
      { data: await service.load(auth.profileId) },
      { headers: PRIVATE_NO_STORE_HEADERS },
    );
  } catch (cause) {
    if (cause instanceof AuthorizationError) return fail(cause.message, cause.status);
    return fail(cause instanceof Error ? cause.message : "Dashboard data could not be loaded.", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return fail("A profile payload is required.", 422);
    const candidate = body as Record<string, unknown>;
    const required = ["fullName", "headline", "summary", "tags", "websiteUrl", "linkedinUrl"] as const;
    if (required.some((field) => typeof candidate[field] !== "string")) {
      return fail("Profile fields must be strings.", 422);
    }
    const form = {
      ...Object.fromEntries(required.map((field) => [field, text(candidate[field])])),
      ...(typeof candidate.company === "string" ? { company: text(candidate.company) } : {}),
    } as ParticipantProfileForm;
    const { auth, service } = await context(request, loadParticipantProfileUpdateSnapshot);
    await service.update(auth.profileId, form);
    return NextResponse.json({ data: { saved: true } });
  } catch (cause) {
    if (cause instanceof AuthorizationError) return fail(cause.message, cause.status);
    return fail(cause instanceof Error ? cause.message : "Profile could not be saved.", 500);
  }
}
