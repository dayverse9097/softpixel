import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icons';
import { Pagination } from '../components/Pagination';
import { EmptyState, ErrorState, Spinner } from '../components/States';
import { useApi } from '../hooks/useApi';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { usePageTitle } from '../hooks/usePageTitle';
import { adminApi } from '../lib/adminApi';
import { formatDate, plural } from '../lib/format';
import type { GameStatus } from '../lib/types';
import { StatusBadge } from './StatusBadge';

const PAGE_SIZE = 20;

export function DashboardPage() {
  usePageTitle('Games');
  const [text, setText] = useState('');
  const [status, setStatus] = useState<GameStatus | ''>('');
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(text.trim(), 250);

  useEffect(() => setPage(1), [q, status]);

  const games = useApi((signal) => adminApi.listGames({ q: q || undefined, status: status || undefined, page, pageSize: PAGE_SIZE }, signal), [q, status, page]);
  const stats = useApi((signal) => adminApi.stats(signal), []);

  return (
    <div>
      <div className="page-title flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Games</h1>
          <p className="text-muted">Create, upload, publish and manage your games.</p>
        </div>
        <Link to="/admin/games/new" className="btn btn-primary">
          <Icon name="plus" />
          New game
        </Link>
      </div>

      <section aria-labelledby="stats-heading" className="glass mt-5 rounded-panel p-5">
        <h2 id="stats-heading" className="mb-1 text-base">Launches in the last {stats.data?.days ?? 30} days</h2>
        <p className="mb-3 text-sm text-faint">Anonymous counts. Nothing about visitors is recorded.</p>
        {stats.error ? (
          <p className="text-muted">{stats.error.message}</p>
        ) : !stats.data ? (
          <Spinner label="Loading statistics" />
        ) : stats.data.items.length === 0 ? (
          <p className="text-muted">No launches recorded yet.</p>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
            {stats.data.items.slice(0, 6).map((item) => (
              <li key={item.slug ?? 'unknown'} className="flex items-center justify-between gap-3 rounded-inner bg-white/[0.05] px-3.5 py-2.5">
                <span className="truncate">{item.title ?? 'Deleted game'}</span>
                <strong>{item.launches}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="glass my-5 flex flex-wrap items-center gap-3 rounded-panel p-4">
        <label className="field min-w-[220px] flex-1">
          <span className="sr-only">Search games</span>
          <Icon name="search" />
          <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search by title or slug" maxLength={80} autoComplete="off" />
        </label>
        <label>
          <span className="sr-only">Filter by status</span>
          <select className="select !w-auto !rounded-full" value={status} onChange={(e) => setStatus(e.target.value as GameStatus | '')}>
            <option value="">All statuses</option>
            <option value="DRAFT">Drafts</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </label>
      </div>

      {games.error ? (
        <ErrorState error={games.error} onRetry={games.reload} title="The games didn’t load" />
      ) : !games.data ? (
        <Spinner label="Loading games" />
      ) : games.data.items.length === 0 ? (
        <EmptyState title={q || status ? 'No games match.' : 'No games yet'}>
          {!q && !status && (
            <Link to="/admin/games/new" className="btn btn-primary">
              Create your first game
            </Link>
          )}
        </EmptyState>
      ) : (
        <>
          <p aria-live="polite" className="mb-3 text-muted">{plural(games.data.total, 'game')}</p>
          <ul className="m-0 grid list-none gap-3 p-0">
            {games.data.items.map((g) => (
              <li key={g.id} className="surface grid items-center gap-x-4 gap-y-2 rounded-card p-4 sm:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="truncate text-base">
                      <Link to={`/admin/games/${g.id}`} className="no-underline">{g.title}</Link>
                    </h2>
                    <StatusBadge status={g.status} />
                  </div>
                  <p className="mt-1 truncate text-sm text-faint">
                    {g.slug} · {g.category} · {plural(g.versionCount ?? 0, 'build')} · updated {formatDate(g.updatedAt)}
                  </p>
                </div>
                <Link to={`/admin/games/${g.id}`} className="btn btn-glass" aria-label={`Edit ${g.title}`}>
                  Edit
                </Link>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} total={games.data.total} onChange={setPage} />
        </>
      )}
    </div>
  );
}
