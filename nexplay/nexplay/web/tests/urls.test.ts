import { describe, expect, it } from 'vitest';
import { isCoverUrl, isPlayUrl } from '../src/lib/urls';

const ORIGIN = 'https://games.example';
const id = '11111111-1111-4111-8111-111111111111';

describe('isPlayUrl', () => {
  it('accepts published and preview paths on the games origin', () => {
    expect(isPlayUrl(`${ORIGIN}/g/${id}/index.html`, ORIGIN)).toBe(true);
    expect(isPlayUrl(`${ORIGIN}/pv/1700000000000.abc/${id}/index.html`, ORIGIN)).toBe(true);
  });

  it.each([
    ['another origin', `https://evil.example/g/${id}/index.html`],
    ['a look-alike host', `https://games.example.evil.test/g/${id}/index.html`],
    ['a different port', `https://games.example:8443/g/${id}/index.html`],
    ['plain http on a real host', `http://games.example/g/${id}/index.html`],
    ['embedded credentials', `https://user:pw@games.example/g/${id}/index.html`],
    ['a path outside /g/ and /pv/', `${ORIGIN}/admin/index.html`],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a data: URL', 'data:text/html,<script>alert(1)</script>'],
    ['a relative path', `/g/${id}/index.html`],
    ['garbage', 'not a url'],
    ['nothing', null],
    ['empty', ''],
  ])('rejects %s', (_label, value) => {
    expect(isPlayUrl(value as string | null, ORIGIN)).toBe(false);
  });

  it('allows plain http only for localhost during development', () => {
    expect(isPlayUrl(`http://localhost:4001/g/${id}/index.html`, 'http://localhost:4001')).toBe(true);
  });
});

describe('isCoverUrl', () => {
  it('only accepts the covers path on the games origin', () => {
    expect(isCoverUrl(`${ORIGIN}/covers/${id}/${id}.png`, ORIGIN)).toBe(true);
    expect(isCoverUrl(`${ORIGIN}/g/${id}/index.html`, ORIGIN)).toBe(false);
    expect(isCoverUrl(`https://evil.example/covers/${id}/${id}.png`, ORIGIN)).toBe(false);
  });
});
