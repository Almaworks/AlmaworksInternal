import { NextResponse } from "next/server";

import { AuthorizationError, requireSemesterAdmin } from "@/src/auth/server";
import { parseReplaceMeetingsRequest, SemesterTransitionError } from "@/src/lifecycle/semester-transition";

export async function POST(request: Request) {
  try {
    const body = parseReplaceMeetingsRequest(await request.json());
    const { adminClient } = await requireSemesterAdmin(request, body.semesterId);
    const { data, error } = await adminClient
      .from("meetings")
      .upsert(body.dates.map((meeting) => ({
        label: meeting.label,
        meeting_date: meeting.date,
        semester_id: body.semesterId,
      })), { ignoreDuplicates: true, onConflict: "semester_id,meeting_date" })
      .select("id");
    if (error) throw new Error(error.message);
    return NextResponse.json({ saved: data?.length ?? 0 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof SemesterTransitionError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to add meetings." },
      { status: 500 },
    );
  }
}
