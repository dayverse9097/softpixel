import { describe, expect, it } from 'vitest';
import { isAllowedOrigin, originOf } from '../../src/lib/origin.js';

const allowed = ['https://app.example.com'];

describe('isAllowedOrigin', () => {
  it('accepts the exact allowed origin', () => {
    expect(isAllowedOrigin('https://app.example.com', undefined, allowed)).toBe(true);
  });
  it('rejects look-alikes, other schemes and ports', () => {
    expect(isAllowedOrigin('https://app.example.com.evil.test', undefined, allowed)).toBe(false);
    expect(isAllowedOrigin('http://app.example.com', undefined, allowed)).toBe(false);
    expect(isAllowedOrigin('https://app.example.com:8443', undefined, allowed)).toBe(false);
    expect(isAllowedOrigin('null', undefined, allowed)).toBe(false);
  });
  it('falls back to the Referer when Origin is missing', () => {
    expect(isAllowedOrigin(undefined, 'https://app.example.com/admin?x=1', allowed)).toBe(true);
    expect(isAllowedOrigin(undefined, 'https://evil.test/https://app.example.com/', allowed)).toBe(false);
  });
  it('rejects requests that carry neither header', () => {
    expect(isAllowedOrigin(undefined, undefined, allowed)).toBe(false);
  });
  it('does not trust Referer when Origin is present and wrong', () => {
    expect(isAllowedOrigin('https://evil.test', 'https://app.example.com/', allowed)).toBe(false);
  });
});

describe('originOf', () => {
  it('returns null for garbage', () => {
    expect(originOf('not a url')).toBeNull();
    expect(originOf(undefined)).toBeNull();
  });
});
