import { NextResponse } from "next/server";

import { AuthorizationError, requireAuthenticatedUserWithRls } from "@/src/auth/server";

function isValidRequest(value: unknown): value is { profileId: string; enabled: boolean } {
  return typeof value === "object" && value !== null
    && "profileId" in value && typeof value.profileId === "string" && value.profileId.trim().length > 0
    && "enabled" in value && typeof value.enabled === "boolean";
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json();
    if (!isValidRequest(body)) {
      return NextResponse.json({ error: "profileId and enabled are required." }, { status: 400 });
    }

    const { userClient } = await requireAuthenticatedUserWithRls(request);
    const { error } = await userClient.rpc("set_platform_super_admin", {
      p_profile_id: body.profileId,
      p_enabled: body.enabled,
    });
    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "42501" ? 403 : 400 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to change platform access." },
      { status: 500 },
    );
  }
}
