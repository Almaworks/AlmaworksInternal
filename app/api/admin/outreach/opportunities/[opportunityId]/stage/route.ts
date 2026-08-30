import { changeStage } from "@/src/outreach/server/commands";
import { handleOutreachJson, parseStageBody } from "@/src/outreach/server/http";

interface RouteContext {
  params: Promise<{ opportunityId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { opportunityId } = await context.params;
  return await handleOutreachJson(
    request,
    (value) => parseStageBody(
      typeof value === "object" && value !== null && !Array.isArray(value)
        ? { ...value, opportunityId }
        : value,
    ),
    async (body) => await changeStage({ request, ...body }),
  );
}
