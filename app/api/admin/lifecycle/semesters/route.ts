import { NextResponse } from "next/server";

import { AuthorizationError, requireSuperAdminWithRls } from "@/src/auth/server";
import {
  createSemesterDraftCommand,
  parseCreateSemesterDraftRequest,
  SemesterTransitionError,
} from "@/src/lifecycle/semester-transition";

const createDraft = createSemesterDraftCommand(async (request) => {
  const { userClient } = await requireSuperAdminWithRls(request);
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
    const { userClient } = await requireSuperAdminWithRls(request);
    const { data: semesters, error: semesterError } = await userClient
      .from("semesters")
      .select("id,name,start_date,end_date,is_active,lifecycle_status,configuration")
      .order("start_date", { ascending: false });
    if (semesterError) throw semesterError;

    const ids = (semesters ?? []).map((semester) => semester.id);
    const { data: meetings, error: meetingsError } = ids.length === 0
      ? { data: [], error: null }
      : await userClient
        .from("meetings")
        .select("id,semester_id,date:meeting_date,label")
        .in("semester_id", ids)
        .order("meeting_date", { ascending: true });
    if (meetingsError) throw meetingsError;
    return NextResponse.json({ semesters: semesters ?? [], meetings: meetings ?? [] });
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
