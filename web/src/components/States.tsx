import type { ReactNode } from 'react';
import type { ApiError } from '../lib/api';
import { Icon } from './Icons';

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-10 text-muted">
      <i aria-hidden="true" className="size-9 animate-spin rounded-full border-[3px] border-white/20 border-t-neon-cyan" />
      <span>{label}…</span>
    </div>
  );
}

/** Placeholder cards with the same shape as real ones, so layout does not shift when data arrives. */
export function LoadingGrid({ count = 8, label = 'Loading games' }: { count?: number; label?: string }) {
  return (
    <div>
      <span role="status" className="sr-only">
        {label}
      </span>
      <div aria-hidden="true" className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="surface animate-shimmer rounded-card p-2.5">
            <div className="aspect-[16/10] rounded-inner bg-white/[0.07]" />
            <div className="space-y-3 px-2 pb-3 pt-4">
              <div className="h-5 w-20 rounded-full bg-white/[0.07]" />
              <div className="h-5 w-3/4 rounded bg-white/[0.07]" />
              <div className="h-4 w-full rounded bg-white/[0.05]" />
              <div className="h-11 rounded-full bg-white/[0.07]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Something went wrong' }: { error: ApiError | Error; onRetry?: () => void; title?: string }) {
  const requestId = 'requestId' in error ? error.requestId : undefined;
  return (
    <div role="alert" className="glass mx-auto grid max-w-xl justify-items-center gap-3.5 rounded-panel p-8 text-center">
      <span className="text-neon-gold">
        <Icon name="alert" size={28} />
      </span>
      <h2 className="text-xl">{title}</h2>
      <p className="text-muted">{error.message}</p>
      {requestId && <p className="text-sm text-faint">Reference: {requestId}</p>}
      {onRetry && (
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          <Icon name="refresh" />
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="glass mx-auto grid max-w-xl justify-items-center gap-3.5 rounded-panel p-8 text-center">
      <h2 className="text-xl">{title}</h2>
      {children && <div className="grid justify-items-center gap-3.5 text-muted">{children}</div>}
    </div>
  );
}
