import { requireSemesterAdmin } from "@/src/auth/server";
import { logActivity, type LogActivityInput } from "@/src/outreach/server/commands";
import {
  handleOutreachJson,
  parseActivityBody,
  type ActivityBody,
} from "@/src/outreach/server/http";

import { loadOpportunitySnapshot } from "../../../_data";

interface RouteContext {
  params: Promise<{ opportunityId: string }>;
}

function withOpportunityId(value: unknown, opportunityId: string): unknown {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...value, opportunityId }
    : value;
}

function commandInput(request: Request, body: ActivityBody): LogActivityInput {
  const base = {
    request,
    semesterId: body.semesterId,
    opportunityId: body.opportunityId,
    updatedAt: body.updatedAt,
    occurredAt: body.occurredAt,
    summary: body.summary,
    details: body.details,
    nextFollowUpAt: body.nextFollowUpAt,
    stage: body.stage,
  };
  switch (body.activityKind) {
    case "email": return { ...base, activityKind: "email", channel: "email" };
    case "linkedin": return { ...base, activityKind: "linkedin", channel: "linkedin" };
    case "call": return { ...base, activityKind: "call", channel: body.channel! };
    case "meeting": return { ...base, activityKind: "meeting", channel: body.channel };
    case "reply": return { ...base, activityKind: "reply", channel: body.channel };
    case "note": return { ...base, activityKind: "note" };
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { opportunityId } = await context.params;
  return await handleOutreachJson(
    request,
    (value) => parseActivityBody(withOpportunityId(value, opportunityId)),
    async (body) => {
      const result = await logActivity(commandInput(request, body));
      if (!result.ok) return result;
      const { userClient } = await requireSemesterAdmin(request, body.semesterId);
      return {
        opportunity: await loadOpportunitySnapshot(
          userClient,
          body.semesterId,
          body.opportunityId,
        ),
        activity: result.value,
      };
    },
    201,
  );
}
