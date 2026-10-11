import { describe, expect, it } from 'vitest';
import { isValidSlug, slugify } from '../../src/lib/slug.js';

describe('isValidSlug', () => {
  it('accepts lowercase words joined by single hyphens', () => {
    expect(isValidSlug('neon-pong')).toBe(true);
    expect(isValidSlug('game2')).toBe(true);
  });
  it.each(['a', '-x', 'x-', 'a--b', 'Upper', 'has space', 'a/b', '../x', "x';--", 'admin', 'api', 'a'.repeat(61), ''])(
    'rejects %j',
    (value) => expect(isValidSlug(value)).toBe(false),
  );
});

describe('slugify', () => {
  it('turns titles into valid slugs', () => {
    expect(slugify('Neon Pong!')).toBe('neon-pong');
    expect(slugify('  Café   Déjà-vu  ')).toBe('cafe-deja-vu');
    expect(isValidSlug(slugify('Star Catcher 2'))).toBe(true);
  });
  it('never exceeds 60 characters or ends with a hyphen', () => {
    const slug = slugify('word '.repeat(40));
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });
});
