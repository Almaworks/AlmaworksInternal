import { AuthorizationError, requireAuthenticatedUserWithRls } from '@/src/auth/server';
import { requestOwnAccess } from '@/src/program/server/canonical-admin';
export async function POST(request: Request) {
  try {
    const { userClient } = await requireAuthenticatedUserWithRls(request);
    const body = await request.json() as { fullName?: unknown };
    if (typeof body.fullName !== 'string' || !body.fullName.trim()) return Response.json({ error: 'Enter your name.' }, { status: 400 });
    await requestOwnAccess(userClient, body.fullName.trim());
    return Response.json({ ok: true });
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : 'Unable to submit access request.' }, { status: cause instanceof AuthorizationError ? cause.status : 400 });
  }
}
