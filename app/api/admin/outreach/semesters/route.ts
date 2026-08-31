import { NextResponse } from "next/server";

import { AuthorizationError, requireAuthenticatedUser } from "@/src/auth/server";
import { requireActiveSemesterAdmin } from "@/src/program/canonical-access";

export async function GET(request: Request) {
  try {
    const { user, userClient } = await requireAuthenticatedUser(request);
    await requireActiveSemesterAdmin(userClient, user.id);

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
    if (error instanceof Error && error.message === "Semester administrator access required.") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load semesters." },
      { status: 500 },
    );
  }
}
