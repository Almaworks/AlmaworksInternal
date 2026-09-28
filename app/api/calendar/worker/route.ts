import { calendarConfiguration } from "@/src/calendar/config";
import { createCalendarRepositories } from "@/src/calendar/repository";
import { runCalendarSyncBatch } from "@/src/calendar/sync-worker";
import { runCalendarHoldBatch } from "@/src/calendar/hold-worker";
import { runCalendarDisconnectBatch } from "@/src/calendar/disconnect-worker";
import { drainCalendarWork, handleCalendarWorker } from "@/src/calendar/worker-endpoint";

export const runtime = "nodejs";
export const maxDuration = 240;

export async function POST(request: Request) {
  // Authenticate before constructing clients or reading provider credentials.
  return handleCalendarWorker(request, {
    secret: process.env.CALENDAR_CRON_SECRET ?? null,
    run: async () => {
      const config = calendarConfiguration();
      if (!config) throw new Error("Calendar is not configured");
      const repositories = await createCalendarRepositories(config);
      const common = { oauth: config.oauth, encryptionKey: config.encryptionKey, limit: 1 };
      return drainCalendarWork({
        sync: () => runCalendarSyncBatch({ ...common, repository: repositories.sync }),
        holds: () => runCalendarHoldBatch({ ...common, repository: repositories.holds }),
        disconnect: () => runCalendarDisconnectBatch({ limit:1,repository:repositories.disconnect }),
      });
    },
  });
}
