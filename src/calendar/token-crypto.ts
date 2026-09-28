import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface TokenRecordContext { profileId: string; connectionId: string }
export interface EncryptedRefreshToken { version: 1; nonce: string; ciphertext: string; tag: string }

function aad(context: TokenRecordContext): Buffer {
  if (!context.profileId || !context.connectionId) throw new Error("Invalid token record context");
  return Buffer.from(JSON.stringify(["almaworks-google-refresh-token", 1, context.profileId, context.connectionId]));
}

function assertKey(key: Buffer): void {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("Invalid encryption key");
}

export function encryptRefreshToken(token: string, key: Buffer, context: TokenRecordContext): EncryptedRefreshToken {
  assertKey(key);
  if (!token) throw new Error("Empty refresh token");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aad(context));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return { version: 1, nonce: nonce.toString("base64url"), ciphertext: ciphertext.toString("base64url"), tag: cipher.getAuthTag().toString("base64url") };
}

export function decryptRefreshToken(record: EncryptedRefreshToken, key: Buffer, context: TokenRecordContext): string {
  assertKey(key);
  if (record.version !== 1 || !/^[A-Za-z0-9_-]+$/.test(record.nonce) || !/^[A-Za-z0-9_-]+$/.test(record.ciphertext) || !/^[A-Za-z0-9_-]+$/.test(record.tag)) throw new Error("Invalid encrypted token");
  const nonce = Buffer.from(record.nonce, "base64url");
  const tag = Buffer.from(record.tag, "base64url");
  if (nonce.length !== 12 || tag.length !== 16) throw new Error("Invalid encrypted token");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(aad(context));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(record.ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Token authentication failed");
  }
}
