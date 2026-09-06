import { NextResponse } from "next/server";

import { AuthorizationError, requireAuthenticatedUserWithRls } from "@/src/auth/server";
import { normalizeMentorNeedSelection } from "@/src/mentor-needs/domain";
import { loadStartupMentorNeeds, MentorNeedsRepositoryError, saveStartupMentorNeeds } from "@/src/mentor-needs/repository";

function errorResponse(error: unknown) {
  if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status });
  const message = error instanceof Error ? error.message : "Unable to manage mentor needs.";
  return NextResponse.json({ error: message }, { status: error instanceof MentorNeedsRepositoryError ? 500 : 400 });
}

export async function GET(request: Request) {
  try {
    const semesterId = new URL(request.url).searchParams.get("semesterId")?.trim();
    if (!semesterId) return NextResponse.json({ error: "semesterId is required." }, { status: 400 });
    const { profileId, userClient } = await requireAuthenticatedUserWithRls(request);
    const record = await loadStartupMentorNeeds(userClient, profileId, semesterId);
    return NextResponse.json({ record });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { semesterId?: string; primary?: string | null; secondary?: string | null; noPreference?: boolean; context?: string };
    if (!body.semesterId?.trim()) return NextResponse.json({ error: "semesterId is required." }, { status: 400 });
    const selection = normalizeMentorNeedSelection({ primary: body.primary ?? null, secondary: body.secondary ?? null, noPreference: body.noPreference === true, context: body.context ?? "" });
    const { profileId, userClient } = await requireAuthenticatedUserWithRls(request);
    const record = await loadStartupMentorNeeds(userClient, profileId, body.semesterId);
    if (record === null) return NextResponse.json({ error: "No active startup membership exists for this semester." }, { status: 404 });
    await saveStartupMentorNeeds(userClient, record.startupSemesterId, selection);
    return NextResponse.json({ selection });
  } catch (error) {
    return errorResponse(error);
  }
}
