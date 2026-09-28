import { runCalendarSettingsCommand } from "@/src/calendar/settings-command";

export const maxDuration = 60;

export async function POST(request: Request) {
  return runCalendarSettingsCommand(request, "sync");
}
