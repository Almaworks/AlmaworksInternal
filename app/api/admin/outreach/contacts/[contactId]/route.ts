import { requireSemesterAdmin } from "@/src/auth/server";
import { updateOutreachContact } from "@/src/outreach/server/contact-commands";
import {
  handleOutreachJson,
  handleOutreachOperation,
  OutreachHttpError,
  parseContactDetailQuery,
  parseUpdateContactBody,
} from "@/src/outreach/server/http";

import { loadContactDetailResponse } from "../../_data";

export async function GET(
  request: Request,
  context: { params: Promise<{ contactId: string }> },
) {
  return await handleOutreachOperation(async () => {
    const { contactId } = await context.params;
    const query = parseContactDetailQuery(new URL(request.url), contactId);
    const { userClient } = await requireSemesterAdmin(request, query.semesterId);
    return await loadContactDetailResponse(userClient, {
      semesterId: query.semesterId,
      contactId: query.contactId,
      activityCursor: query.activityCursor,
      activityPageSize: query.activityPageSize,
    });
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ contactId: string }> },
) {
  return await handleOutreachJson(request, parseUpdateContactBody, async (body) => {
    const { contactId } = await context.params;
    if (body.contactId !== contactId) {
      throw new OutreachHttpError(400, "validation_error", "contactId must match the request path.", "contactId");
    }
    return await updateOutreachContact({ ...body, request });
  });
}
