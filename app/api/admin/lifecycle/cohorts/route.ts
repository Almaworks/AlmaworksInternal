import { NextResponse } from "next/server";

import { AuthorizationError, requireSemesterAdmin } from "@/src/auth/server";
import { buildCohortOptions } from "@/src/lifecycle/cohort-management";
import {
  CohortRepositoryError,
  loadCohortMembers,
  loadManageableCohorts,
} from "@/src/lifecycle/cohort-repository";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const semesterId = url.searchParams.get("semesterId")?.trim();
    const scope = url.searchParams.get("scope") ?? "semester";
    if (!semesterId || (scope !== "semester" && scope !== "all")) {
      return NextResponse.json({ error: "semesterId and a valid scope are required." }, { status: 400 });
    }

    const { user, userClient } = await requireSemesterAdmin(request, semesterId);
    const manageable = await loadManageableCohorts(userClient, user.id);
    const selected = scope === "all"
      ? manageable
      : manageable.filter((semester) => semester.id === semesterId);
    const members = await loadCohortMembers(userClient, selected);
    return NextResponse.json({ cohorts: buildCohortOptions(manageable), members, scope });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof CohortRepositoryError || error instanceof Error
      ? error.message
      : "Unable to load cohort memberships.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
