export type SequenzyNotificationResult =
  | { ok: true; emailSendId: string }
  | { ok: false; error: string };

export type SequenzySubmission =
  | { kind: 'accepted'; emailSendId: string }
  | { kind: 'rejected'; error: string }
  | { kind: 'unknown'; error: string };

type SendOptions = {
  apiKey: string;
  to: string;
  subject: string;
  html: string;
  fetch?: typeof fetch;
};

export async function submitSequenzyNotification(options: SendOptions): Promise<SequenzySubmission> {
  const fetcher = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await fetcher('https://api.sequenzy.com/api/v1/transactional/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: options.to,
        from: 'Almaworks <alerts@almaworks.sequenzymail.com>',
        subject: options.subject,
        html: options.html,
        emailType: 'transactional',
      }),
    });
  } catch {
    return { kind: 'unknown', error: 'Sequenzy delivery status is unknown. Check its dashboard before retrying.' };
  }

  if (!response.ok) {
    if (response.status >= 500 || response.status === 408 || response.status === 429) {
      return { kind: 'unknown', error: 'Sequenzy delivery status is unknown. Check its dashboard before retrying.' };
    }
    return { kind: 'rejected', error: `Sequenzy rejected the email (HTTP ${response.status}).` };
  }

  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'success' in body && body.success === true &&
        'emailSendId' in body && typeof body.emailSendId === 'string' && body.emailSendId.length > 0) {
      return { kind: 'accepted', emailSendId: body.emailSendId };
    }
  } catch {
    // An accepted request with an unreadable response may already be queued.
  }
  return { kind: 'unknown', error: 'Sequenzy delivery status is unknown. Check its dashboard before retrying.' };
}

export async function sendSequenzyNotification(options: SendOptions): Promise<SequenzyNotificationResult> {
  const result = await submitSequenzyNotification(options);
  return result.kind === 'accepted'
    ? { ok: true, emailSendId: result.emailSendId }
    : { ok: false, error: result.error };
}
