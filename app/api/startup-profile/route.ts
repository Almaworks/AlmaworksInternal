import { NextResponse } from "next/server";

import { AuthorizationError, requireAuthenticatedUserWithRls } from "@/src/auth/server";
import { type StartupProfileForm } from "@/src/dashboard/participant-dashboard";
import { isStartupStage, normalizeStartupStage } from "@/src/program/startup-stage";

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function ensure(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function PATCH(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return NextResponse.json({ error: "A startup profile payload is required." }, { status: 422 });
    const candidate = body as Record<string, unknown>;
    const stage = text(candidate.stage);
    if (!text(candidate.name).trim()) return NextResponse.json({ error: "Startup name is required." }, { status: 422 });
    if (!isStartupStage(stage)) return NextResponse.json({ error: "Startup stage is invalid." }, { status: 422 });
    const form: StartupProfileForm = {
      name: text(candidate.name), industry: text(candidate.industry), stage: normalizeStartupStage(stage),
      description: text(candidate.description), websiteUrl: text(candidate.websiteUrl),
    };
    const auth = await requireAuthenticatedUserWithRls(request);
    const activeSemester = await auth.userClient.from("semesters").select("id").eq("is_active", true).maybeSingle();
    ensure(activeSemester.error);
    if (!activeSemester.data) throw new Error("No active semester is available.");
    const membership = await auth.userClient.from("semester_memberships")
      .select("id")
      .eq("semester_id", activeSemester.data.id)
      .eq("profile_id", auth.profileId)
      .eq("role", "startup")
      .in("status", ["onboarding", "active"])
      .maybeSingle();
    ensure(membership.error);
    if (!membership.data) throw new AuthorizationError("An active startup team membership is required.", 403);
    const team = await auth.userClient.from("startup_team_memberships")
      .select("startup_semester_id")
      .eq("semester_id", activeSemester.data.id)
      .eq("semester_membership_id", membership.data.id)
      .maybeSingle();
    ensure(team.error);
    if (!team.data) throw new AuthorizationError("Startup team assignment is missing.", 403);
    const startup = await auth.userClient.from("startup_semesters")
      .select("startup_organization_id")
      .eq("id", team.data.startup_semester_id)
      .eq("semester_id", activeSemester.data.id)
      .maybeSingle();
    ensure(startup.error);
    if (!startup.data) return NextResponse.json({ error: "Startup profile is missing." }, { status: 404 });
    const organizationResult = await auth.userClient.from("startup_organizations")
      .update({ name: form.name.trim(), industry: form.industry.trim() || null, description: form.description.trim() || null, website_url: form.websiteUrl.trim() || null })
      .eq("id", startup.data.startup_organization_id)
      .select("id")
      .maybeSingle();
    ensure(organizationResult.error);
    if (!organizationResult.data) return NextResponse.json({ error: "Your startup access changed. Reload the page before trying again." }, { status: 409 });
    const semesterResult = await auth.userClient.from("startup_semesters")
      .update({ stage: form.stage })
      .eq("id", team.data.startup_semester_id)
      .eq("semester_id", activeSemester.data.id)
      .select("id")
      .maybeSingle();
    ensure(semesterResult.error);
    if (!semesterResult.data) return NextResponse.json({ error: "Your startup stage was not saved. Reload the page and try again." }, { status: 409 });
    return NextResponse.json({ data: { saved: true } });
  } catch (cause) {
    if (cause instanceof AuthorizationError) return NextResponse.json({ error: cause.message }, { status: cause.status });
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Startup profile could not be saved." }, { status: 500 });
  }
}
