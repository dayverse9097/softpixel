import { useState } from 'react';
import { Pagination } from '../components/Pagination';
import { ErrorState, Spinner } from '../components/States';
import { useApi } from '../hooks/useApi';
import { usePageTitle } from '../hooks/usePageTitle';
import { adminApi } from '../lib/adminApi';
import { formatDate } from '../lib/format';

export function AuditPage() {
  usePageTitle('Activity');
  const [page, setPage] = useState(1);
  const events = useApi((signal) => adminApi.audit(page, signal), [page]);
  return (
    <div>
      <div className="page-title">
        <h1>Activity</h1>
        <p className="text-muted">A record of sign-ins and changes made by administrators. Passwords and codes are never recorded.</p>
      </div>
      {events.error ? (
        <ErrorState error={events.error} onRetry={events.reload} />
      ) : !events.data ? (
        <Spinner label="Loading activity" />
      ) : (
        <>
          <ul className="m-0 mt-5 grid list-none gap-2.5 p-0">
            {events.data.items.map((e) => (
              <li key={e.id} className="surface flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-card px-4 py-3">
                <span>
                  <strong>{e.action}</strong>
                  {e.targetType && <span className="text-muted"> on {e.targetType}</span>}
                </span>
                <span className="text-sm text-faint">
                  {e.actor ?? 'system'} · {formatDate(e.createdAt, true)}
                </span>
              </li>
            ))}
          </ul>
          {events.data.items.length === 0 && <p className="mt-5 text-muted">Nothing recorded yet.</p>}
          <Pagination page={page} pageSize={events.data.pageSize} total={events.data.total} onChange={setPage} />
        </>
      )}
    </div>
  );
}
