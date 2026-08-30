import { NextResponse } from "next/server";

import { AuthorizationError, requireSemesterAdmin } from "@/src/auth/server";
import {
  createSemesterDraftCommand,
  parseCreateSemesterDraftRequest,
  SemesterTransitionError,
} from "@/src/lifecycle/semester-transition";

const createDraft = createSemesterDraftCommand(async (request, semesterId) => {
  const { userClient } = await requireSemesterAdmin(request, semesterId);
  return {
    createSemesterDraft: async (args) => await userClient.rpc("create_semester_draft", args),
  };
});

function errorResponse(error: unknown) {
  if (error instanceof AuthorizationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof SemesterTransitionError || error instanceof SyntaxError) {
    const status = error instanceof SemesterTransitionError && error.code === "23505" ? 409 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unable to manage semesters." },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    const sourceSemesterId = new URL(request.url).searchParams.get("sourceSemesterId")?.trim();
    if (!sourceSemesterId) {
      return NextResponse.json({ error: "sourceSemesterId is required." }, { status: 400 });
    }
    const { userClient } = await requireSemesterAdmin(request, sourceSemesterId);
    const { data: semesters, error: semesterError } = await userClient
      .from("semesters")
      .select("id,name,start_date,end_date,is_active,lifecycle_status,configuration")
      .order("start_date", { ascending: false });
    if (semesterError) throw semesterError;

    const ids = (semesters ?? []).map((semester) => semester.id);
    const { data: sessionDates, error: datesError } = ids.length === 0
      ? { data: [], error: null }
      : await userClient
        .from("session_dates")
        .select("id,semester_id,date,label")
        .in("semester_id", ids)
        .order("date", { ascending: true });
    if (datesError) throw datesError;
    return NextResponse.json({ semesters: semesters ?? [], sessionDates: sessionDates ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = parseCreateSemesterDraftRequest(await request.json());
    return NextResponse.json(await createDraft({ request, ...body }), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
