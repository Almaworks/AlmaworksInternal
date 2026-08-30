import { NextResponse } from "next/server";

import { AuthorizationError, requireSemesterAdmin } from "@/src/auth/server";
import { buildCohortOptions } from "@/src/lifecycle/cohort-management";
import { loadManageableCohorts } from "@/src/lifecycle/cohort-repository";
import { loadMentorNeedsBoard, MentorNeedsRepositoryError } from "@/src/mentor-needs/repository";
import { buildMentorNeedsBoardPayload } from "@/src/mentor-needs/http";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const semesterId = url.searchParams.get("semesterId")?.trim();
    const scope = url.searchParams.get("scope") ?? "semester";
    if (!semesterId || (scope !== "semester" && scope !== "all")) return NextResponse.json({ error: "semesterId and a valid scope are required." }, { status: 400 });
    const { user, userClient } = await requireSemesterAdmin(request, semesterId);
    const manageable = await loadManageableCohorts(userClient, user.id);
    const semesterIds = scope === "all" ? manageable.map((semester) => semester.id) : [semesterId];
    const rows = await loadMentorNeedsBoard(userClient, semesterIds);
    return NextResponse.json(buildMentorNeedsBoardPayload(buildCohortOptions(manageable), rows, scope));
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status });
    const message = error instanceof MentorNeedsRepositoryError || error instanceof Error ? error.message : "Unable to load mentor needs.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
