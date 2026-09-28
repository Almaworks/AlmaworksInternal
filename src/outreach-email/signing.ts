import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export interface OutreachEmailSigningKeyring {
  currentKeyId: string;
  keys: Readonly<Record<string, string>>;
}

export interface OutreachEmailSnapshot {
  body: string;
  contactId: string;
  createdAt: string;
  idempotencyExpiresAt: string;
  idempotencyKey: string;
  messageId: string;
  opportunityId: string;
  recipientEmail: string;
  recipientName: string;
  scheduledAt: string | null;
  semesterId: string;
  sender: string;
  subject: string;
  version: 1;
}

export interface OutreachEmailProviderReceipt {
  checkedAt: string;
  deliveredAt: string | null;
  lastError: string | null;
  messageId: string;
  messageStatus: string;
  providerId: string | null;
  providerStatus: string;
  semesterId: string;
  sentAt: string | null;
  snapshotDigest: string;
  version: 1;
}

export interface OutreachEmailSignature { digest: string; keyId: string; signature: string }

export interface OutreachEmailSigner {
  signReceipt(receipt: OutreachEmailProviderReceipt): OutreachEmailSignature;
  signSnapshot(snapshot: OutreachEmailSnapshot): OutreachEmailSignature;
  verifyReceipt(receipt: OutreachEmailProviderReceipt, signed: OutreachEmailSignature): boolean;
  verifySnapshot(snapshot: OutreachEmailSnapshot, signed: OutreachEmailSignature): { ok: boolean; digest: string };
}

function canonical(values: readonly (string | null | number)[]): string {
  return values.map((value) => value === null ? "-" : `${String(value).length}:${String(value)}`).join("|");
}

function instant(value: string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function snapshotPayload(value: OutreachEmailSnapshot): string {
  return canonical([value.version, value.messageId, value.semesterId, value.opportunityId, value.contactId, value.recipientEmail, value.recipientName, value.sender, value.subject, value.body, instant(value.scheduledAt), value.idempotencyKey, instant(value.createdAt), instant(value.idempotencyExpiresAt)]);
}

function receiptPayload(value: OutreachEmailProviderReceipt): string {
  return canonical([value.version, value.messageId, value.semesterId, value.snapshotDigest, value.providerId, value.providerStatus, value.messageStatus, instant(value.checkedAt), instant(value.sentAt), instant(value.deliveredAt), value.lastError]);
}

function equalHex(left: string, right: string): boolean {
  if (!/^[0-9a-f]+$/u.test(left) || !/^[0-9a-f]+$/u.test(right) || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function createOutreachEmailSigner(keyring: OutreachEmailSigningKeyring): OutreachEmailSigner {
  if (!keyring.currentKeyId || !keyring.keys[keyring.currentKeyId]) throw new Error("The current outreach email signing key is missing.");
  for (const [keyId, secret] of Object.entries(keyring.keys)) {
    if (!keyId || keyId.length > 100 || Buffer.byteLength(secret, "utf8") < 32) {
      throw new Error("Outreach email signing keys require a key identifier of at most 100 characters and at least 32 bytes of secret material.");
    }
  }
  const sign = (payload: string, keyId = keyring.currentKeyId): string => createHmac("sha256", keyring.keys[keyId] ?? "").update(payload).digest("hex");
  return {
    signSnapshot(snapshot: OutreachEmailSnapshot): OutreachEmailSignature {
      const payload = snapshotPayload(snapshot);
      return { digest: createHash("sha256").update(payload).digest("hex"), keyId: keyring.currentKeyId, signature: sign(payload) };
    },
    verifySnapshot(snapshot: OutreachEmailSnapshot, signed: OutreachEmailSignature): { ok: boolean; digest: string } {
      const payload = snapshotPayload(snapshot);
      const digest = createHash("sha256").update(payload).digest("hex");
      if (!keyring.keys[signed.keyId] || !equalHex(digest, signed.digest)) return { ok: false, digest };
      return { ok: equalHex(sign(payload, signed.keyId), signed.signature), digest };
    },
    signReceipt(receipt: OutreachEmailProviderReceipt): OutreachEmailSignature {
      const payload = receiptPayload(receipt);
      return { digest: createHash("sha256").update(payload).digest("hex"), keyId: keyring.currentKeyId, signature: sign(payload) };
    },
    verifyReceipt(receipt: OutreachEmailProviderReceipt, signed: OutreachEmailSignature): boolean {
      const payload = receiptPayload(receipt);
      if (!keyring.keys[signed.keyId]) return false;
      return equalHex(createHash("sha256").update(payload).digest("hex"), signed.digest) && equalHex(sign(payload, signed.keyId), signed.signature);
    },
  };
}
