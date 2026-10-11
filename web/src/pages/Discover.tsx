import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GameGrid } from '../components/GameCard';
import { Icon } from '../components/Icons';
import { Pagination } from '../components/Pagination';
import { EmptyState, ErrorState, LoadingGrid } from '../components/States';
import { useApi } from '../hooks/useApi';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { usePageTitle } from '../hooks/usePageTitle';
import { api } from '../lib/api';
import { plural } from '../lib/format';

const PAGE_SIZE = 12;

export function DiscoverPage() {
  usePageTitle('Discover');
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').slice(0, 80);
  const cat = params.get('cat') ?? '';
  const sort = params.get('sort') === 'title' ? 'title' : 'new';
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1);

  const [text, setText] = useState(q);
  const debounced = useDebouncedValue(text.replace(/\s+/g, ' ').trim(), 250);
  const emitted = useRef(q);

  const update = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };

  // Typing updates the address bar (so results can be shared); an outside change, such as the header search, updates the box.
  useEffect(() => {
    if (debounced !== q) {
      emitted.current = debounced;
      update({ q: debounced || undefined, page: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  useEffect(() => {
    if (q !== emitted.current) {
      emitted.current = q;
      setText(q);
    }
  }, [q]);

  const games = useApi((signal) => api.listGames({ q: q || undefined, category: cat || undefined, sort, page, pageSize: PAGE_SIZE }, signal), [q, cat, sort, page]);
  const categories = useApi((signal) => api.categories(signal), []);

  const filtered = Boolean(q || cat);
  const total = games.data?.total ?? 0;

  return (
    <div className="wrap">
      <div className="page-title">
        <h1>Discover games</h1>
        <p className="text-muted">Search the library or pick a category.</p>
      </div>

      <div className="glass my-[22px] grid gap-3.5 rounded-panel p-4">
        <label className="field">
          <span className="sr-only">Search games</span>
          <Icon name="search" />
          <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search by title or category" autoComplete="off" maxLength={80} />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-2.5">
            <button type="button" className="chip" aria-pressed={!cat} onClick={() => update({ cat: undefined, page: undefined })}>
              All
            </button>
            {categories.data?.map((c) => (
              <button key={c.name} type="button" className="chip" aria-pressed={cat === c.name} onClick={() => update({ cat: c.name, page: undefined })}>
                {c.name}
              </button>
            ))}
          </div>
          <label>
            <span className="sr-only">Sort games</span>
            <select className="select !w-auto !rounded-full" value={sort} onChange={(e) => update({ sort: e.target.value === 'title' ? 'title' : undefined, page: undefined })}>
              <option value="new">Newest first</option>
              <option value="title">Title A to Z</option>
            </select>
          </label>
        </div>
      </div>

      <p aria-live="polite" className="mb-3.5 min-h-6 text-muted">
        {games.data ? (filtered ? `${plural(total, 'game')} found` : plural(total, 'game')) : ''}
      </p>

      {games.error ? (
        <ErrorState error={games.error} onRetry={games.reload} title="The games didn’t load" />
      ) : games.data && games.data.items.length > 0 ? (
        <>
          <GameGrid games={games.data.items} />
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={(p) => update({ page: p > 1 ? String(p) : undefined })} />
        </>
      ) : games.data ? (
        <EmptyState title={filtered ? 'No games match.' : 'No games have been published yet.'}>
          {filtered && (
            <>
              <p>Try a different word or pick another category.</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setText('');
                  emitted.current = '';
                  setParams(new URLSearchParams(), { replace: true });
                }}
              >
                Clear filters
              </button>
            </>
          )}
        </EmptyState>
      ) : (
        <LoadingGrid />
      )}
    </div>
  );
}
