'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown = null,
  ) {
    super(message);
  }
}

// Fetch JSON; on 401 the session expired → go back to the login screen.
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init });
  if (res.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new ApiError('Session expired', 401);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error ?? `Request failed (HTTP ${res.status})`, res.status, json);
  return json as T;
}

// Minimal SWR-style hook: refetches when `url` changes, aborts stale requests,
// keeps the previous data while loading. `url = null` disables the request.
export function useApi<T>(url: string | null, { refreshMs }: { refreshMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!url) {
        setData(null);
        return;
      }
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      if (!silent) setLoading(true);
      try {
        const json = await fetchJson<T>(url, { signal: controller.signal });
        setData(json);
        setError(null);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError((err as Error).message);
      } finally {
        if (controllerRef.current === controller) setLoading(false);
      }
    },
    [url],
  );

  useEffect(() => {
    load();
    return () => controllerRef.current?.abort();
  }, [load]);

  useEffect(() => {
    if (!refreshMs || !url) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') load(true);
    }, refreshMs);
    return () => clearInterval(t);
  }, [refreshMs, url, load]);

  // mutate: update the cached data locally (e.g. drop a deleted row) without refetching.
  return { data, error, loading, reload: load, mutate: setData };
}
