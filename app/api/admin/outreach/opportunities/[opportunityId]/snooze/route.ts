import { requireSemesterAdmin } from "@/src/auth/server";
import { snoozeOpportunity } from "@/src/outreach/server/commands";
import { handleOutreachJson, parseSnoozeBody } from "@/src/outreach/server/http";

import { loadLatestActivitySnapshot } from "../../../_data";

interface RouteContext {
  params: Promise<{ opportunityId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { opportunityId } = await context.params;
  return await handleOutreachJson(
    request,
    (value) => parseSnoozeBody(
      typeof value === "object" && value !== null && !Array.isArray(value)
        ? { ...value, opportunityId }
        : value,
    ),
    async (body) => {
      const result = await snoozeOpportunity({ request, ...body });
      if (!result.ok) return result;
      const { userClient } = await requireSemesterAdmin(request, body.semesterId);
      return {
        opportunity: result.value,
        activity: await loadLatestActivitySnapshot(
          userClient,
          body.semesterId,
          body.opportunityId,
          ["snooze"],
        ),
      };
    },
  );
}
