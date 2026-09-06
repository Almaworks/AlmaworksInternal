import { NextResponse } from "next/server";

import { AuthorizationError, requireAuthenticatedUserWithRls } from "@/src/auth/server";
import { createOrFindExpertiseTag, ExpertiseTagRepositoryError, searchExpertiseTags } from "@/src/expertise-tags/server";

export async function GET(request: Request) {
  try {
    const { userClient } = await requireAuthenticatedUserWithRls(request);
    const query = new URL(request.url).searchParams.get("q") ?? "";
    return NextResponse.json(await searchExpertiseTags(userClient, query));
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : 400;
    const message = error instanceof Error ? error.message : "Unable to search expertise tags.";
    return NextResponse.json({ error: message }, { status: error instanceof ExpertiseTagRepositoryError ? 500 : status });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: string };
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return NextResponse.json({ error: "An expertise tag name is required." }, { status: 400 });
    }
    const { profileId, userClient } = await requireAuthenticatedUserWithRls(request);
    return NextResponse.json({ tag: await createOrFindExpertiseTag(userClient, profileId, body.name) }, { status: 201 });
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : 400;
    const message = error instanceof Error ? error.message : "Unable to create expertise tag.";
    return NextResponse.json({ error: message }, { status: error instanceof ExpertiseTagRepositoryError ? 500 : status });
  }
}
