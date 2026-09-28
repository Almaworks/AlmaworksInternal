import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

import { ALMAWORKS_SUPABASE_URL } from '../calendar/config.ts';
import type { Database } from '../db/types.ts';
import { runNotificationPipeline } from './pipeline.ts';

type Environment = Readonly<Record<string, string | undefined>>;
const hash = (value: string) => createHash('sha256').update(value).digest();

export function notificationWorkerConfiguration(env: Environment): {
  anonKey: string; appOrigin: string; apiKey: string; activatedAt: string;
  workerEmail: string; workerPassword: string; semesterIds: string[]; secret: string;
} | null {
  if (env.NEXT_PUBLIC_SUPABASE_URL !== ALMAWORKS_SUPABASE_URL) throw new Error('Notification Supabase project does not match Almaworks.');
  if (env.NOTIFICATION_ENABLED !== 'true') return null;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const appOrigin = env.NOTIFICATION_APP_ORIGIN?.trim();
  const apiKey = env.SEQUENZY_API_KEY?.trim();
  const activatedAt = env.NOTIFICATION_ACTIVATED_AT?.trim();
  const workerEmail = env.NOTIFICATION_WORKER_EMAIL?.trim();
  const workerPassword = env.NOTIFICATION_WORKER_PASSWORD;
  const secret = env.NOTIFICATION_CRON_SECRET;
  const semesterIds = env.NOTIFICATION_SEMESTER_IDS?.split(',').map(id => id.trim()).filter(Boolean) ?? [];
  if (!anonKey || !appOrigin || !apiKey || !activatedAt || !workerEmail || !workerPassword || !secret || secret.length < 32 || !semesterIds.length) return null;
  const origin = new URL(appOrigin);
  if (origin.protocol !== 'https:' || origin.origin !== appOrigin || origin.username || origin.password) throw new Error('Notification app origin must be public HTTPS.');
  if (Number.isNaN(Date.parse(activatedAt))) throw new Error('Notification activation time is invalid.');
  return { anonKey, appOrigin, apiKey, activatedAt, workerEmail, workerPassword, semesterIds, secret };
}

export async function handleNotificationWorker(request: Request, env: Environment = process.env): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  if (request.method !== 'GET') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers: { ...headers, Allow: 'GET' } });
  let config: ReturnType<typeof notificationWorkerConfiguration>;
  try { config = notificationWorkerConfiguration(env); }
  catch { return Response.json({ error: 'Notification worker configuration is invalid.' }, { status: 503, headers }); }
  if (!config) return Response.json({ error: 'Notification worker is not configured.' }, { status: 503, headers });
  const supplied = request.headers.get('authorization');
  const token = supplied?.startsWith('Bearer ') ? supplied.slice(7) : '';
  if (!token || !timingSafeEqual(hash(token), hash(config.secret))) return Response.json({ error: 'Unauthorized.' }, { status: 401, headers });
  try {
    const client = createClient<Database>(ALMAWORKS_SUPABASE_URL, config.anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const login = await client.auth.signInWithPassword({ email: config.workerEmail, password: config.workerPassword });
    if (login.error || !login.data.user) throw new Error('Worker authentication failed.');
    const summary = await runNotificationPipeline({ client, apiKey: config.apiKey, appOrigin: config.appOrigin, activatedAt: config.activatedAt, semesterIds: config.semesterIds });
    await client.auth.signOut();
    return Response.json(summary, { headers });
  } catch {
    return Response.json({ error: 'Notification worker failed; inspect server logs and delivery records.' }, { status: 503, headers });
  }
}
