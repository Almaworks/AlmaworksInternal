import { NextResponse } from "next/server";

import { AuthorizationError } from "@/src/auth/server";
import {
  MentorAccessError,
  MentorAccessReconciliationError,
  MentorAccessValidationError,
  parseMentorAccessRequest,
} from "@/src/mentors/access";
import { setMentorAccess } from "@/src/mentors/server";

interface RouteContext {
  params: Promise<{ mentorSemesterId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { mentorSemesterId } = await context.params;
    const body = parseMentorAccessRequest(await request.json());
    return NextResponse.json(await setMentorAccess({ request, mentorSemesterId, ...body }));
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof MentorAccessReconciliationError) {
      return NextResponse.json(
        { databaseState: error.databaseState, error: error.message, reconciliationRequired: true },
        { status: 502 },
      );
    }
    if (error instanceof MentorAccessValidationError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof MentorAccessError) {
      const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : error.code === "partial_update" ? 409 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update mentor access." },
      { status: 500 },
    );
  }
}
