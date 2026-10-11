import { useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../lib/api';
import type { GameDetail } from '../lib/types';

/**
 * Look up games for a list of saved slugs. Each slug is fetched once and remembered, so removing an
 * item from the list does not trigger another request. Unavailable games are reported separately.
 */
export function useGamesBySlugs(slugs: readonly string[]): { games: GameDetail[]; unavailable: string[]; loading: boolean } {
  const cache = useRef(new Map<string, GameDetail | 'missing'>());
  const [, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const key = slugs.join(',');

  useEffect(() => {
    const wanted = slugs.filter((s) => !cache.current.has(s));
    if (wanted.length === 0) return;
    const controller = new AbortController();
    setLoading(true);
    Promise.allSettled(wanted.map((s) => api.getGame(s, controller.signal))).then((results) => {
      if (controller.signal.aborted) return;
      results.forEach((result, i) => {
        const slug = wanted[i] as string;
        if (result.status === 'fulfilled') cache.current.set(slug, result.value);
        else if (result.reason instanceof ApiError && result.reason.status === 404) cache.current.set(slug, 'missing');
      });
      setLoading(false);
      setVersion((v) => v + 1);
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const games: GameDetail[] = [];
  const unavailable: string[] = [];
  for (const slug of slugs) {
    const entry = cache.current.get(slug);
    if (entry === 'missing') unavailable.push(slug);
    else if (entry) games.push(entry);
  }
  return { games, unavailable, loading };
}
