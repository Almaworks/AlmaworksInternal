import { handleNotificationWorker } from '../../../../src/notifications/worker-endpoint.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return handleNotificationWorker(request);
}
