"use client";

import { DependencyList, useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

type QueryState<T> = {
  data: T | null;
  error: string;
  loading: boolean;
  setData: Dispatch<SetStateAction<T | null>>;
  reload: (options?: { force?: boolean }) => Promise<T | null>;
};

type QueryOptions = {
  cacheKey?: string;
  ttlMs?: number;
};

type CacheEntry = {
  data: unknown;
  updatedAt: number;
};

const DEFAULT_TTL_MS = 30_000;
const queryCache = new Map<string, CacheEntry>();

function readCache<T>(cacheKey?: string, ttlMs = DEFAULT_TTL_MS): T | null {
  if (!cacheKey) return null;
  const cached = queryCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.updatedAt > ttlMs) {
    queryCache.delete(cacheKey);
    return null;
  }
  return cached.data as T;
}

function writeCache<T>(cacheKey: string | undefined, value: T) {
  if (!cacheKey) return;
  queryCache.set(cacheKey, { data: value, updatedAt: Date.now() });
}

export function invalidateQueryCache(prefix?: string) {
  if (!prefix) {
    queryCache.clear();
  } else {
    for (const key of queryCache.keys()) {
      if (key === prefix || key.startsWith(`${prefix}:`) || key.startsWith(prefix)) {
        queryCache.delete(key);
      }
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("smartcrm:invalidate-query", { detail: { prefix: prefix || "*" } }));
  }
}

export function useApiQuery<T>(loader: () => Promise<T>, deps: DependencyList = [], options: QueryOptions = {}): QueryState<T> {
  const stableLoader = useCallback(loader, deps);
  const cacheKey = options.cacheKey;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;

  const [data, setData] = useState<T | null>(() => readCache<T>(cacheKey, ttlMs));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(() => !readCache<T>(cacheKey, ttlMs));

  const reload = useCallback(
    async (reloadOptions?: { force?: boolean }) => {
      try {
        const force = reloadOptions?.force ?? false;
        if (!force) {
          const cached = readCache<T>(cacheKey, ttlMs);
          if (cached !== null) {
            setData(cached);
            setError("");
            setLoading(false);
            return cached;
          }
        }

        setLoading(true);
        setError("");
        const next = await stableLoader();
        setData(next);
        writeCache(cacheKey, next);
        return next;
      } catch (error) {
        setError(error instanceof Error ? error.message : "Request failed");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [cacheKey, stableLoader, ttlMs],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (typeof window === "undefined" || !cacheKey) return;

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ prefix?: string }>).detail;
      const prefix = detail?.prefix;
      if (prefix === "*" || !prefix || cacheKey === prefix || cacheKey.startsWith(prefix)) {
        void reload({ force: true });
      }
    };

    window.addEventListener("smartcrm:invalidate-query", handler as EventListener);
    return () => window.removeEventListener("smartcrm:invalidate-query", handler as EventListener);
  }, [cacheKey, reload]);

  return useMemo(() => ({ data, error, loading, setData, reload }), [data, error, loading, reload]);
}
