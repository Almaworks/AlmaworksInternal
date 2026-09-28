import { emailBodyHtml, emailBodyParts } from "../outreach-email/links.ts";

const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const DEFAULT_TIMEOUT_MILLISECONDS = 10_000;
const MAX_TIMEOUT_MILLISECONDS = 30_000;
const HEADER_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const LOCAL_PART = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/u;
const DOMAIN_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u;

export interface GmailMessageInput {
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  body: string;
}

export type GmailSendResult =
  | { kind: "accepted"; messageId: string; threadId: string }
  | { kind: "rejected"; message: string }
  | { kind: "uncertain"; message: string };

export interface GmailProviderOptions {
  fetch?: typeof fetch;
  timeoutMilliseconds?: number;
}

function validEmailAddress(value: string): boolean {
  if (
    value.length > 254
    || value.trim() !== value
    || HEADER_CONTROL_CHARACTERS.test(value)
  ) return false;

  const at = value.lastIndexOf("@");
  if (at <= 0 || at !== value.indexOf("@")) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (
    local.length > 64
    || !LOCAL_PART.test(local)
    || local.startsWith(".")
    || local.endsWith(".")
    || local.includes("..")
  ) return false;

  const labels = domain.split(".");
  return labels.length >= 2 && labels.every((label) => DOMAIN_LABEL.test(label));
}

function validationFailure(accessToken: string, input: GmailMessageInput): GmailSendResult | null {
  if (!accessToken || HEADER_CONTROL_CHARACTERS.test(accessToken)) {
    return { kind: "rejected", message: "A valid Gmail access token is required." };
  }
  if (!validEmailAddress(input.senderEmail)) {
    return { kind: "rejected", message: "The sender email address is invalid." };
  }
  if (!validEmailAddress(input.recipientEmail)) {
    return { kind: "rejected", message: "The recipient email address is invalid." };
  }
  if (!input.subject.trim() || HEADER_CONTROL_CHARACTERS.test(input.subject)) {
    return { kind: "rejected", message: "The email subject is invalid." };
  }
  return null;
}

function encodedWords(value: string): string {
  const chunks: string[] = [];
  let chunk = "";
  let bytes = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (chunk && bytes + characterBytes > 39) {
      chunks.push(chunk);
      chunk = "";
      bytes = 0;
    }
    chunk += character;
    bytes += characterBytes;
  }
  if (chunk) chunks.push(chunk);
  return chunks
    .map((part) => `=?UTF-8?B?${Buffer.from(part, "utf8").toString("base64")}?=`)
    .join("\r\n ");
}

function encodeSubject(subject: string): string {
  return /^[\u0020-\u007e]+$/u.test(subject) && subject.length <= 69
    ? subject
    : encodedWords(subject);
}

function wrapBase64(value: string): string {
  return value.match(/.{1,76}/gu)?.join("\r\n") ?? "";
}

function rawMessage(input: GmailMessageInput): string {
  const encodedBody = wrapBase64(Buffer.from(input.body, "utf8").toString("base64"));
  const headers = [
    `From: ${input.senderEmail}`,
    `To: ${input.recipientEmail}`,
    `Subject: ${encodeSubject(input.subject)}`,
    "MIME-Version: 1.0",
  ];
  const content = [
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    encodedBody,
  ];
  const parts = emailBodyParts(input.body);
  if (parts.some(part => part.href)) {
    const boundary = "almaworks_alternative";
    const plain = parts.map(part => part.href ? `${part.text} (${part.href})` : part.text).join("");
    content.splice(0, content.length,
      `Content-Type: multipart/alternative; boundary="${boundary}"`, "",
      `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "",
      wrapBase64(Buffer.from(plain, "utf8").toString("base64")),
      `--${boundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "",
      wrapBase64(Buffer.from(emailBodyHtml(input.body), "utf8").toString("base64")),
      `--${boundary}--`, "");
  }
  const mime = [...headers, ...content].join("\r\n");
  return Buffer.from(mime, "utf8").toString("base64url");
}

function timeoutMilliseconds(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_TIMEOUT_MILLISECONDS;
  }
  return Math.min(Math.floor(value), MAX_TIMEOUT_MILLISECONDS);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function sendGmailMessage(
  accessToken: string,
  input: GmailMessageInput,
  options: GmailProviderOptions = {},
): Promise<GmailSendResult> {
  const invalid = validationFailure(accessToken, input);
  if (invalid) return invalid;

  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(GMAIL_SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: rawMessage(input) }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMilliseconds(options.timeoutMilliseconds)),
    });
  } catch {
    return {
      kind: "uncertain",
      message: "Gmail may have received the send request. Check the mailbox before trying again.",
    };
  }

  if (response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (typeof body === "object" && body !== null) {
      const { id, threadId } = body as { id?: unknown; threadId?: unknown };
      if (nonEmptyString(id) && nonEmptyString(threadId)) {
        return { kind: "accepted", messageId: id, threadId };
      }
    }
    return {
      kind: "uncertain",
      message: "Gmail returned an incomplete send result. Check the mailbox before trying again.",
    };
  }

  if (response.status >= 400 && response.status < 500 && response.status !== 408) {
    return {
      kind: "rejected",
      message: `Gmail rejected the send request (HTTP ${response.status}).`,
    };
  }

  return {
    kind: "uncertain",
    message: `Gmail may have received the send request (HTTP ${response.status}). Check the mailbox before trying again.`,
  };
}
