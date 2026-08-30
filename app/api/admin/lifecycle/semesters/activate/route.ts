import { NextResponse } from "next/server";

import { AuthorizationError, requireSemesterAdmin } from "@/src/auth/server";
import {
  createActivateSemesterCommand,
  parseActivateSemesterRequest,
  SemesterTransitionError,
} from "@/src/lifecycle/semester-transition";

const activateSemester = createActivateSemesterCommand(async (request, semesterId) => {
  const { userClient } = await requireSemesterAdmin(request, semesterId);
  return {
    activateSemester: async (args) => await userClient.rpc("activate_semester_transition", args),
  };
});

export async function POST(request: Request) {
  try {
    const body = parseActivateSemesterRequest(await request.json());
    return NextResponse.json(await activateSemester({ request, ...body }));
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof SemesterTransitionError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to activate semester." },
      { status: 500 },
    );
  }
}
