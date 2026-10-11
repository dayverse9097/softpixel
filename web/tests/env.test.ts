import { describe, expect, it } from 'vitest';
import { envProblems } from '../src/lib/env';

describe('envProblems', () => {
  it('accepts a correct production setup', () => {
    expect(envProblems({ PROD: true, VITE_GAMES_ORIGIN: 'https://games.example' })).toEqual([]);
  });
  it('allows plain http only for localhost (used by the browser tests)', () => {
    expect(envProblems({ PROD: true, VITE_GAMES_ORIGIN: 'http://localhost:4001' })).toEqual([]);
    expect(envProblems({ PROD: true, VITE_GAMES_ORIGIN: 'http://games.example' })).toHaveLength(1);
  });
  it('reports a missing or malformed games origin in production', () => {
    expect(envProblems({ PROD: true })).toHaveLength(1);
    expect(envProblems({ PROD: true, VITE_GAMES_ORIGIN: 'not a url' })).toHaveLength(1);
  });
  it('does not complain during development', () => {
    expect(envProblems({ PROD: false })).toEqual([]);
  });
});
