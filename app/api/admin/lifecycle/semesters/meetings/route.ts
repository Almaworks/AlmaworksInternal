import { NextResponse } from "next/server";

import { AuthorizationError, requireSemesterAdmin } from "@/src/auth/server";
import {
  createReplaceMeetingsCommand,
  parseReplaceMeetingsRequest,
  SemesterTransitionError,
} from "@/src/lifecycle/semester-transition";

const replaceMeetings = createReplaceMeetingsCommand(async (request, semesterId) => {
  const { userClient } = await requireSemesterAdmin(request, semesterId);
  type ReplaceMeetingsRpc = (
    name: "replace_draft_meetings",
    args: { p_semester_id: string; p_meetings: import("@/src/db/types").Json },
  ) => PromiseLike<{ data: number | null; error: { code?: string; message: string } | null }>;
  const rpc = userClient.rpc.bind(userClient) as unknown as ReplaceMeetingsRpc;
  return {
    replaceMeetings: async (args) => await rpc("replace_draft_meetings", args),
  };
});

export async function POST(request: Request) {
  try {
    const body = parseReplaceMeetingsRequest(await request.json());
    return NextResponse.json(await replaceMeetings({ request, ...body }));
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof SemesterTransitionError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save meetings." },
      { status: 500 },
    );
  }
}
