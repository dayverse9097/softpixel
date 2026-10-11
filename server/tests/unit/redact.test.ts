import { describe, expect, it } from 'vitest';
import { redact } from '../../src/lib/redact.js';

describe('redact', () => {
  it('hides credential-like keys at any depth', () => {
    const out = redact({
      email: 'a@b.test',
      password: 'hunter2',
      nested: { sessionToken: 'abc', recoveryCodes: ['x'], keep: 1 },
      headers: { authorization: 'Bearer x', cookie: 'sid=1' },
    });
    expect(JSON.stringify(out)).not.toMatch(/hunter2|Bearer|sid=1|abc/);
    expect(out).toMatchObject({ email: 'a@b.test', nested: { keep: 1 } });
  });
  it('truncates long strings and deep structures', () => {
    expect((redact('x'.repeat(1000)) as string).length).toBeLessThan(600);
    expect(JSON.stringify(redact({ a: { b: { c: { d: { e: { f: 1 } } } } } }))).toContain('[truncated]');
  });
});
