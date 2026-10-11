import { describe, expect, it } from 'vitest';
import { signPreviewToken, verifyPreviewToken } from '../../src/lib/preview-token.js';

const secret = 's'.repeat(40);
const versionA = '11111111-1111-4111-8111-111111111111';
const versionB = '22222222-2222-4222-8222-222222222222';

describe('preview tokens', () => {
  const now = 1_700_000_000_000;
  const token = signPreviewToken(secret, versionA, now + 60_000);

  it('verifies for the right version before expiry', () => {
    expect(verifyPreviewToken(secret, versionA, token, now)).toBe(true);
  });
  it('fails after expiry', () => {
    expect(verifyPreviewToken(secret, versionA, token, now + 60_001)).toBe(false);
  });
  it('is bound to one version', () => {
    expect(verifyPreviewToken(secret, versionB, token, now)).toBe(false);
  });
  it('fails with another secret', () => {
    expect(verifyPreviewToken('t'.repeat(40), versionA, token, now)).toBe(false);
  });
  it('cannot be stretched by editing the expiry', () => {
    const forged = `${now + 9_999_999}.${token.split('.')[1]}`;
    expect(verifyPreviewToken(secret, versionA, forged, now)).toBe(false);
  });
  it.each(['', '.', 'abc', '123.', 'x.y', '-5.abc'])('rejects malformed token %j', (bad) => {
    expect(verifyPreviewToken(secret, versionA, bad, now)).toBe(false);
  });
});
