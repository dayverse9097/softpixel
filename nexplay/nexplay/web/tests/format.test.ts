import { describe, expect, it } from 'vitest';
import { formatBytes, formatDate, plural } from '../src/lib/format';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1536, '1.5 KB'],
    [20480, '20 KB'],
    [5 * 1024 * 1024, '5.0 MB'],
    [3 * 1024 ** 3, '3.0 GB'],
  ])('%d -> %s', (bytes, text) => expect(formatBytes(bytes)).toBe(text));
  it('returns nothing for impossible values', () => {
    expect(formatBytes(-1)).toBe('');
    expect(formatBytes(Number.NaN)).toBe('');
  });
});

describe('formatDate', () => {
  it('handles missing and invalid dates without throwing', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate('not a date')).toBe('');
    expect(formatDate('2026-10-02T10:00:00.000Z')).toContain('2026');
  });
});

describe('plural', () => {
  it('chooses the right form', () => {
    expect(plural(1, 'game')).toBe('1 game');
    expect(plural(0, 'game')).toBe('0 games');
    expect(plural(2, 'category', 'categories')).toBe('2 categories');
  });
});
