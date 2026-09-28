import { authorizeCalendar } from "@/src/calendar/authorization";
import { calendarConfiguration } from "@/src/calendar/config";
import { handleCalendarConnect } from "@/src/calendar/http";
import { createCalendarRepositories } from "@/src/calendar/repository";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const config = calendarConfiguration();
  return handleCalendarConnect(request, {
    config, authorize: authorizeCalendar,
    repository: async () => {
      if (!config) throw new Error("Calendar is unavailable");
      return (await createCalendarRepositories(config)).connection;
    },
  });
}
