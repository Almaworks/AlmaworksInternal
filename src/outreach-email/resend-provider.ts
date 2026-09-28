export interface OutreachEmailProvider {
  cancel(providerId: string): Promise<ProviderCancellationResult>;
  retrieve(providerId: string): Promise<ProviderRetrievalResult>;
  submit(message: ProviderSubmission): Promise<ProviderSubmissionResult>;
}

export interface ProviderSubmission {
  body: string;
  idempotencyKey: string;
  recipientEmail: string;
  scheduledAt: string | null;
  sender: string;
  subject: string;
}

export type ProviderSubmissionResult =
  | { kind: "accepted"; providerId: string }
  | { kind: "rejected"; message: string }
  | { kind: "ambiguous"; message: string };

export type ProviderRetrievalResult =
  | { kind: "found"; providerId: string; providerStatus: string }
  | { kind: "rejected"; message: string }
  | { kind: "ambiguous"; message: string };

export type ProviderCancellationResult =
  | { kind: "cancelled"; providerId: string }
  | { kind: "rejected"; message: string }
  | { kind: "ambiguous"; message: string };

interface ResendProviderOptions {
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMilliseconds?: number;
}

function messageFrom(value: unknown, fallback: string): string {
  if (typeof value !== "object" || value === null) return fallback;
  const message = (value as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

async function json(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

export function createResendProvider(options: ResendProviderOptions): OutreachEmailProvider {
  const fetchImpl = options.fetch ?? fetch;
  const call = async (path: string, init?: RequestInit): Promise<Response | null> => {
    try {
      return await fetchImpl(`https://api.resend.com${path}`, {
        ...init,
        signal: init?.signal ?? AbortSignal.timeout(options.timeoutMilliseconds ?? 10_000),
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
      });
    } catch {
      return null;
    }
  };
  return {
    async submit(message) {
      const response = await call("/emails", {
        method: "POST",
        headers: { "Idempotency-Key": message.idempotencyKey },
        body: JSON.stringify({
          from: message.sender,
          to: [message.recipientEmail],
          subject: message.subject,
          text: message.body,
          ...(message.scheduledAt === null ? {} : { scheduled_at: message.scheduledAt }),
        }),
      });
      if (!response) return { kind: "ambiguous", message: "The provider result is unknown." };
      const body = await json(response);
      if (response.ok) {
        const id = typeof body === "object" && body !== null ? (body as { id?: unknown }).id : null;
        return typeof id === "string" && id ? { kind: "accepted", providerId: id } : { kind: "ambiguous", message: "The provider accepted the request without returning an identifier." };
      }
      const error = messageFrom(body, "The provider rejected the email request.");
      return response.status === 409 || response.status >= 500 ? { kind: "ambiguous", message: error } : { kind: "rejected", message: error };
    },
    async retrieve(providerId) {
      const response = await call(`/emails/${encodeURIComponent(providerId)}`);
      if (!response) return { kind: "ambiguous", message: "The provider result is unknown." };
      const body = await json(response);
      if (response.ok && typeof body === "object" && body !== null) {
        const id = (body as { id?: unknown }).id;
        const status = (body as { last_event?: unknown }).last_event;
        if (typeof id === "string" && typeof status === "string") return { kind: "found", providerId: id, providerStatus: status };
        return { kind: "ambiguous", message: "The provider returned an incomplete email record." };
      }
      const error = messageFrom(body, "The provider could not retrieve the email.");
      return response.status >= 500 ? { kind: "ambiguous", message: error } : { kind: "rejected", message: error };
    },
    async cancel(providerId) {
      const response = await call(`/emails/${encodeURIComponent(providerId)}/cancel`, { method: "POST" });
      if (!response) return { kind: "ambiguous", message: "The provider cancellation result is unknown." };
      const body = await json(response);
      if (response.ok) {
        const id = typeof body === "object" && body !== null ? (body as { id?: unknown }).id : null;
        return id === providerId ? { kind: "cancelled", providerId } : { kind: "ambiguous", message: "The provider returned a different email identifier." };
      }
      const error = messageFrom(body, "The provider could not cancel the email.");
      return response.status >= 500 || response.status === 409 ? { kind: "ambiguous", message: error } : { kind: "rejected", message: error };
    },
  };
}
