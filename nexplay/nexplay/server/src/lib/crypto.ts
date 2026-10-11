import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** AES-256-GCM with a random 96-bit IV. Output: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function encryptString(keyHex: string, plaintext: string): string {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) throw new Error('encryption key must be 32 bytes');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptString(keyHex: string, payload: string): string {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) throw new Error('encryption key must be 32 bytes');
  const [version, iv, tag, ciphertext] = payload.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('unrecognized payload');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** HMAC-SHA256 with a domain-separation label, so one key can safely serve several purposes. */
export function hmacHex(keyHex: string, label: string, value: string): string {
  return createHmac('sha256', Buffer.from(keyHex, 'hex')).update(`${label}:${value}`).digest('hex');
}

/** Constant-time string comparison that does not leak length. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols, no look-alikes, so bytes map without bias

/** 16 symbols from a 32-symbol alphabet is 80 bits of entropy. Format: XXXX-XXXX-XXXX-XXXX. */
export function newRecoveryCode(): string {
  const bytes = randomBytes(16);
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % 32]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

export function normalizeRecoveryCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}
