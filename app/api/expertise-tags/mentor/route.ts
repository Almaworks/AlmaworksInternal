import { NextResponse } from "next/server";

import { AuthorizationError, requireAuthenticatedUserWithRls } from "@/src/auth/server";
import { createOrFindExpertiseTag, ExpertiseTagRepositoryError } from "@/src/expertise-tags/server";

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { tags?: unknown };
    if (!Array.isArray(body.tags) || !body.tags.every((tag) => typeof tag === "string" && tag.trim().length > 0)) {
      return NextResponse.json({ error: "tags must be a list of tag names." }, { status: 400 });
    }
    const { profileId, userClient } = await requireAuthenticatedUserWithRls(request);
    const tags = await Promise.all(body.tags.map(async (name) => await createOrFindExpertiseTag(userClient, profileId, name)));
    const clear = await userClient.from("mentor_expertise_tags").delete().eq("mentor_profile_id", profileId);
    if (clear.error !== null) throw new ExpertiseTagRepositoryError(clear.error.message);
    if (tags.length > 0) {
      const inserted = await userClient.from("mentor_expertise_tags").insert(tags.map((tag) => ({ mentor_profile_id: profileId, expertise_tag_id: tag.id })));
      if (inserted.error !== null) throw new ExpertiseTagRepositoryError(inserted.error.message);
    }
    return NextResponse.json({ tags });
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : error instanceof ExpertiseTagRepositoryError ? 500 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save mentor expertise." }, { status });
  }
}
