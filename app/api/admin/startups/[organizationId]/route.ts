import { NextResponse } from "next/server";

import { AuthorizationError, requireAuthenticatedUserWithRls } from "@/src/auth/server";
import { parseStartupDeletionRequest, StartupDeletionError } from "@/src/program/server/startup-deletion";

export async function DELETE(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  try {
    const { organizationId } = await params;
    const input = parseStartupDeletionRequest(await request.json());
    if (input.startupOrganizationId !== organizationId) {
      return NextResponse.json({ error: "Startup deletion target does not match the request." }, { status: 400 });
    }

    const context = await requireAuthenticatedUserWithRls(request);
    const { data: role, error: roleError } = await context.userClient
      .from("platform_roles")
      .select("role")
      .eq("profile_id", context.profileId)
      .eq("role", "super_admin")
      .maybeSingle();
    if (roleError) throw roleError;
    if (role === null) throw new AuthorizationError("Platform super-administrator access required.", 403);

    const { data, error } = await context.userClient.rpc("delete_startup_permanently", {
      p_confirmation_name: input.confirmationName,
      p_startup_organization_id: input.startupOrganizationId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof StartupDeletionError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete startup." }, { status: 500 });
  }
}
