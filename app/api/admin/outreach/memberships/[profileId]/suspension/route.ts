import { suspendOutreachMembership } from "@/src/auth/server";
import {
  handleOutreachJson,
  parseMembershipSuspensionBody,
} from "@/src/outreach/server/http";

interface RouteContext {
  params: Promise<{ profileId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { profileId } = await context.params;
  return await handleOutreachJson(
    request,
    (value) => parseMembershipSuspensionBody(
      typeof value === "object" && value !== null && !Array.isArray(value)
        ? { ...value, profileId }
        : value,
    ),
    async (body) => await suspendOutreachMembership({ request, ...body }),
  );
}
