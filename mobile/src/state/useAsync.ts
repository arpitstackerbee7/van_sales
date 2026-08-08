/** Minimal data-fetching hook: enough for this app, nothing more. */

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '../api/client';

interface State<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** True when the failure was transport-level, so a retry is worth offering. */
  offline: boolean;
}

export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
): State<T> & { reload: () => Promise<void> } {
  const [state, setState] = useState<State<T>>({
    data: null,
    error: null,
    loading: true,
    offline: false,
  });

  // Guards against a slow response landing after the screen has moved on.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await fn();
      if (alive.current) setState({ data, error: null, loading: false, offline: false });
    } catch (e) {
      if (!alive.current) return;
      const offline = e instanceof ApiError && e.offline;
      setState({
        data: null,
        error: e instanceof Error ? e.message : 'Something went wrong.',
        loading: false,
        offline,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  return { ...state, reload: run };
}
