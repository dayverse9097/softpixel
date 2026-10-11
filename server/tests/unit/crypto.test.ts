import { describe, expect, it } from 'vitest';
import {
  decryptString,
  encryptString,
  hmacHex,
  newRecoveryCode,
  normalizeRecoveryCode,
  randomToken,
  safeEqual,
} from '../../src/lib/crypto.js';

const key = 'ab'.repeat(32);

describe('encryptString / decryptString', () => {
  it('round-trips and never repeats a ciphertext', () => {
    const a = encryptString(key, 'JBSWY3DPEHPK3PXP');
    const b = encryptString(key, 'JBSWY3DPEHPK3PXP');
    expect(a).not.toBe(b);
    expect(a).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptString(key, a)).toBe('JBSWY3DPEHPK3PXP');
  });
  it('detects tampering and wrong keys', () => {
    const payload = encryptString(key, 'secret');
    const parts = payload.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptString(key, parts.join('.'))).toThrow();
    expect(() => decryptString('cd'.repeat(32), payload)).toThrow();
  });
  it('rejects bad keys and payloads', () => {
    expect(() => encryptString('abcd', 'x')).toThrow();
    expect(() => decryptString(key, 'nonsense')).toThrow();
  });
});

describe('safeEqual', () => {
  it('compares strings of any length', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});

describe('hmacHex', () => {
  it('separates purposes by label', () => {
    expect(hmacHex(key, 'recovery', 'X')).not.toBe(hmacHex(key, 'other', 'X'));
    expect(hmacHex(key, 'recovery', 'X')).toBe(hmacHex(key, 'recovery', 'X'));
  });
});

describe('recovery codes', () => {
  it('have the expected shape and are unique', () => {
    const codes = new Set(Array.from({ length: 200 }, () => newRecoveryCode()));
    expect(codes.size).toBe(200);
    for (const code of codes) expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
  });
  it('normalize regardless of case, spaces and dashes', () => {
    expect(normalizeRecoveryCode('abcd-efgh 2345-jklm')).toBe('ABCDEFGH2345JKLM');
  });
});

describe('randomToken', () => {
  it('is url-safe and unpredictable', () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(a);
  });
});
