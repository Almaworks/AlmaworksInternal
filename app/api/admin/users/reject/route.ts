import { NextResponse } from "next/server";

import { AuthorizationError, requireAuthenticatedUserWithRls } from "@/src/auth/server";
import { createSupabaseAdminCapabilitySource } from "@/src/auth/admin-capability";

export async function POST(request: Request) {
  try {
    const { userId } = (await request.json()) as { userId?: string };
    if (!userId) return NextResponse.json({ error: "userId is required." }, { status: 400 });

    const { profileId, userClient } = await requireAuthenticatedUserWithRls(request);
    const [capability, account] = await Promise.all([
      createSupabaseAdminCapabilitySource(userClient).isSuperAdmin(profileId),
      userClient.from("profiles").select("status,is_active").eq("id", profileId).maybeSingle(),
    ]);
    if (capability.error || account.error) throw new AuthorizationError("Unable to verify registration access.", 500);
    if (!capability.data || account.data?.status !== "approved" || account.data.is_active !== true) {
      throw new AuthorizationError("Active Super Admin access required.", 403);
    }
    const { data, error } = await userClient
      .from("profiles")
      .update({ status: "rejected" })
      .eq("id", userId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Pending profile not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to reject profile." },
      { status: 500 },
    );
  }
}
