// Favorites and recently played. Only game slugs are stored, only in this browser, and never sent anywhere.

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface Backend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Read a stored list defensively: bad JSON, wrong types, junk values and duplicates are all dropped. */
export function parseSlugList(raw: string | null, max: number): string[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === 'string' && item.length <= 60 && SLUG.test(item) && !out.includes(item)) out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

export interface SlugStore {
  get(): string[];
  subscribe(listener: () => void): () => void;
  set(next: string[]): void;
  toggle(slug: string): void;
  push(slug: string): void;
  clear(): void;
  /** Re-read from storage (used when another tab changes it). */
  refresh(): void;
}

export function createSlugStore(key: string, max: number, backend: Backend | null): SlugStore {
  const read = () => {
    try {
      return parseSlugList(backend?.getItem(key) ?? null, max);
    } catch {
      return [];
    }
  };
  let list = read();
  const listeners = new Set<() => void>();
  const publish = (next: string[]) => {
    list = next.slice(0, max);
    try {
      backend?.setItem(key, JSON.stringify(list));
    } catch {
      /* storage may be full or blocked; the list still works for this visit */
    }
    listeners.forEach((l) => l());
  };
  return {
    get: () => list,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: publish,
    toggle: (slug) => publish(list.includes(slug) ? list.filter((s) => s !== slug) : [slug, ...list]),
    push: (slug) => publish([slug, ...list.filter((s) => s !== slug)]),
    clear: () => publish([]),
    refresh() {
      const next = read();
      if (next.join() !== list.join()) {
        list = next;
        listeners.forEach((l) => l());
      }
    },
  };
}

function browserStorage(): Backend | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // access can throw when storage is blocked
  }
}

export const favorites = createSlugStore('nexplay.favorites', 48, browserStorage());
export const recentlyPlayed = createSlugStore('nexplay.recent', 12, browserStorage());

if (typeof window !== 'undefined') {
  window.addEventListener('storage', () => {
    favorites.refresh();
    recentlyPlayed.refresh();
  });
}
