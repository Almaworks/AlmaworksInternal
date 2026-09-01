import { NextResponse } from "next/server";

import { AuthorizationError, requireAuthenticatedUser } from "@/src/auth/server";
import { requireActiveSemesterAdmin } from "@/src/program/canonical-access";

export async function POST(request: Request) {
  try {
    const { userId } = (await request.json()) as { userId?: string };
    if (!userId) return NextResponse.json({ error: "userId is required." }, { status: 400 });

    const { user, userClient, adminClient } = await requireAuthenticatedUser(request);
    await requireActiveSemesterAdmin(userClient, user.id);
    const { data, error } = await adminClient
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
    if (error instanceof Error && error.message === "Semester administrator access required.") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to reject profile." },
      { status: 500 },
    );
  }
}
