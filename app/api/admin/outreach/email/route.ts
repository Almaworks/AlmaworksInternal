import { createDefaultOutreachEmailHandlers } from "@/src/outreach-email/server";

const handlers = createDefaultOutreachEmailHandlers();

export const GET = handlers.GET;
export const POST = handlers.POST;
