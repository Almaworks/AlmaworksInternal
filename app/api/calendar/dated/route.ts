import { runDatedCalendarGet, runDatedCalendarPost } from "@/src/calendar/dated-http";

export const maxDuration = 60;
export async function GET(request: Request) { return runDatedCalendarGet(request); }
export async function POST(request: Request) { return runDatedCalendarPost(request); }
