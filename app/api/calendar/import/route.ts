import { runCalendarSettingsCommand } from "@/src/calendar/settings-command";
export async function POST(request: Request) { return runCalendarSettingsCommand(request,"import"); }
