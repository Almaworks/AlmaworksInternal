import { runCalendarDisconnect } from "@/src/calendar/disconnect-command";
export async function POST(request:Request){return runCalendarDisconnect(request);}
