import { NextResponse } from "next/server";

import { AuthorizationError, requireAuthenticatedUser } from "@/src/auth/server";

export async function GET(request: Request) {
  try {
    const { user, userClient } = await requireAuthenticatedUser(request);
    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError !== null || profile?.role !== "admin") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const { data, error } = await userClient
      .from("semesters")
      .select("id, name, is_active, start_date")
      .order("is_active", { ascending: false })
      .order("start_date", { ascending: false });
    if (error !== null) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ semesters: data ?? [] });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load semesters." },
      { status: 500 },
    );
  }
}
