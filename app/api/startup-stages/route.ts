import { NextResponse } from "next/server";
import { AuthorizationError, requireAuthenticatedUserWithRls } from "@/src/auth/server";
import { isStartupStage, normalizeStartupStage } from "@/src/program/startup-stage";

export async function GET(request: Request) {
  try {
    const { userClient } = await requireAuthenticatedUserWithRls(request);
    const stages = new Set<string>();
    for (let start = 0; ; start += 500) {
      const result = await userClient.from("startup_semesters").select("id,stage").order("id").range(start, start + 499);
      if (result.error) throw result.error;
      for (const row of result.data ?? []) if (isStartupStage(row.stage)) stages.add(normalizeStartupStage(row.stage));
      if ((result.data?.length ?? 0) < 500) break;
    }
    return NextResponse.json({ stages: [...stages].sort() });
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Stage suggestions could not be loaded." }, { status: 503 });
  }
}
