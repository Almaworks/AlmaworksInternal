import { requireSemesterAdmin } from "@/src/auth/server";
import { transferOwner } from "@/src/outreach/server/commands";
import { handleOutreachJson, parseOwnerBody } from "@/src/outreach/server/http";

import { loadLatestActivitySnapshot } from "../../../_data";

interface RouteContext {
  params: Promise<{ opportunityId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { opportunityId } = await context.params;
  return await handleOutreachJson(
    request,
    (value) => parseOwnerBody(
      typeof value === "object" && value !== null && !Array.isArray(value)
        ? { ...value, opportunityId }
        : value,
    ),
    async (body) => {
      const result = await transferOwner({ request, ...body });
      if (!result.ok) return result;
      const { userClient } = await requireSemesterAdmin(request, body.semesterId);
      return {
        opportunity: result.value,
        activity: await loadLatestActivitySnapshot(
          userClient,
          body.semesterId,
          body.opportunityId,
          ["owner_transfer"],
        ),
      };
    },
  );
}
