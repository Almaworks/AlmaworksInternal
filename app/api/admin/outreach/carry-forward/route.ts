import {
  carryForwardOutreachContacts,
  parseCarryForwardBody,
} from "@/src/outreach/server/carry-forward";
import { handleOutreachJson } from "@/src/outreach/server/http";

export async function POST(request: Request) {
  return await handleOutreachJson(request, parseCarryForwardBody, async (body) =>
    await carryForwardOutreachContacts({ request, ...body }));
}
