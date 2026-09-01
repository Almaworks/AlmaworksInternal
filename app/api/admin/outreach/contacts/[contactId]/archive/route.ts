import { archiveOutreachContact } from "@/src/outreach/server/contact-commands";
import {
  handleOutreachJson,
  OutreachHttpError,
  parseArchiveContactBody,
} from "@/src/outreach/server/http";

interface RouteContext { params: Promise<{ contactId: string }> }

export async function POST(request: Request, context: RouteContext) {
  const { contactId } = await context.params;
  return await handleOutreachJson(request, parseArchiveContactBody, async (body) => {
    if (body.contactId !== contactId) {
      throw new OutreachHttpError(400, "validation_error", "contactId must match the request path.", "contactId");
    }
    return await archiveOutreachContact({ ...body, request });
  });
}
