import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, isAbort } from '../lib/api';

export interface ApiState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Load data when the dependencies change. A request that is no longer wanted is cancelled, the previous
 * data stays visible while the next request runs, and errors are always ApiError objects.
 */
export function useApi<T>(fetcher: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[]): ApiState<T> {
  const [state, setState] = useState<{ data: T | null; error: ApiError | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const latest = useRef(fetcher);
  latest.current = fetcher;

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    latest.current(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ data, error: null, loading: false });
      },
      (err: unknown) => {
        if (isAbort(err) || controller.signal.aborted) return;
        setState({ data: null, error: err instanceof ApiError ? err : new ApiError(0, 'error', 'Something went wrong. Please try again.'), loading: false });
      },
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
