export async function handleEmailSignInStart(request: Request, start: (email: string) => Promise<'password' | 'code'>): Promise<Response> {
  const origin = request.headers.get('origin');
  const publicHost = request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '');
  if (origin !== new URL(request.url).origin && origin !== `${protocol}://${publicHost}`) return Response.json({ error: 'Start sign-in from the Almaworks website.' }, { status: 403 });
  try {
    const text = await request.text();
    if (text.length > 4096) return Response.json({ error: 'Invalid sign-in request.' }, { status: 400 });
    let body: unknown;
    try { body = JSON.parse(text); } catch { return Response.json({ error: 'Invalid sign-in request.' }, { status: 400 }); }
    if (!body || typeof body !== 'object' || !('email' in body) || typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(body.email.trim())) return Response.json({ error: 'Enter a valid email.' }, { status: 400 });
    const mode = await start(body.email);
    return Response.json({ mode }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) {
    console.error('account_signin_start_failed', cause instanceof Error ? cause.message : 'Unknown sign-in failure');
    return Response.json({ error: 'Unable to start sign-in or send a setup code. Please try again shortly or contact Almaworks. Your access has not changed.' }, { status: 503 });
  }
}
