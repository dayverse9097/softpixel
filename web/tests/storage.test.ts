import { describe, expect, it } from 'vitest';
import { createSlugStore, parseSlugList, type Backend } from '../src/lib/storage';

function memoryBackend(initial: Record<string, string> = {}): Backend & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

describe('parseSlugList', () => {
  it('reads a valid list', () => {
    expect(parseSlugList('["neon-pong","star-catcher"]', 10)).toEqual(['neon-pong', 'star-catcher']);
  });
  it.each([null, '', '{not json', '{"a":1}', '"text"', '42'])('returns an empty list for %j', (raw) => {
    expect(parseSlugList(raw as string | null, 10)).toEqual([]);
  });
  it('drops junk, wrong types and duplicates', () => {
    const raw = JSON.stringify(['ok-one', 'Bad Slug', 7, null, '../x', 'ok-one', '<script>', 'ok-two', 'a'.repeat(80), '__proto__']);
    expect(parseSlugList(raw, 10)).toEqual(['ok-one', 'ok-two']);
  });
  it('never returns more than the limit', () => {
    const raw = JSON.stringify(Array.from({ length: 30 }, (_, i) => `game-${i}`));
    expect(parseSlugList(raw, 5)).toHaveLength(5);
  });
});

describe('createSlugStore', () => {
  it('toggles, keeps the newest first, and saves to storage', () => {
    const backend = memoryBackend();
    const store = createSlugStore('k', 10, backend);
    store.toggle('a-game');
    store.toggle('b-game');
    expect(store.get()).toEqual(['b-game', 'a-game']);
    store.toggle('a-game');
    expect(store.get()).toEqual(['b-game']);
    expect(JSON.parse(backend.data['k'] as string)).toEqual(['b-game']);
  });

  it('moves a replayed game to the front without duplicating it', () => {
    const store = createSlugStore('k', 3, memoryBackend());
    ['one', 'two', 'three'].forEach((s) => store.push(s));
    store.push('one');
    expect(store.get()).toEqual(['one', 'three', 'two']);
    store.push('four');
    expect(store.get()).toEqual(['four', 'one', 'three']);
  });

  it('notifies listeners and stops after unsubscribe', () => {
    const store = createSlugStore('k', 5, memoryBackend());
    let calls = 0;
    const off = store.subscribe(() => calls++);
    store.push('one');
    off();
    store.push('two');
    expect(calls).toBe(1);
  });

  it('keeps working when storage is missing or throws', () => {
    const none = createSlugStore('k', 5, null);
    none.push('one');
    expect(none.get()).toEqual(['one']);
    const broken = createSlugStore('k', 5, {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    });
    broken.push('one');
    expect(broken.get()).toEqual(['one']);
  });

  it('refresh picks up a change made in another tab', () => {
    const backend = memoryBackend();
    const store = createSlugStore('k', 5, backend);
    let calls = 0;
    store.subscribe(() => calls++);
    backend.data['k'] = JSON.stringify(['from-other-tab']);
    store.refresh();
    expect(store.get()).toEqual(['from-other-tab']);
    expect(calls).toBe(1);
    store.refresh();
    expect(calls).toBe(1);
  });

  it('ignores corrupted stored data at start-up', () => {
    const store = createSlugStore('k', 5, memoryBackend({ k: '{broken' }));
    expect(store.get()).toEqual([]);
  });
});
