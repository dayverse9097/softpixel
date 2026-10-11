import { describe, expect, it } from 'vitest';
import { passwordProblems } from '../../src/lib/password-policy.js';

describe('passwordProblems', () => {
  it('accepts a long passphrase', () => {
    expect(passwordProblems('correct horse battery staple', 'admin@example.com')).toEqual([]);
  });
  it('flags short, numeric, repetitive and email-derived passwords', () => {
    expect(passwordProblems('short1')).not.toEqual([]);
    expect(passwordProblems('123456789012')).not.toEqual([]);
    expect(passwordProblems('aaaaaaaaaaaaaa')).not.toEqual([]);
    expect(passwordProblems('my-levi-secret-2026', 'levi@example.com')).not.toEqual([]);
  });
  it('caps length', () => {
    expect(passwordProblems('a1b2c3d4e5'.repeat(20))).not.toEqual([]);
  });
});
