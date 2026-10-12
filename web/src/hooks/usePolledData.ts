import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "../lib/errors.ts";

/**
 * Loads `fetcher` now and every `ms` after (null: only on `reload()`), so data stays current
 * without a refresh. A failed load keeps the last good data and reports `error`.
 * Memoize `fetcher` with useCallback: a new one starts a fresh load.
 */
export function usePolledData<T>(fetcher: () => Promise<T>, ms: number | null = 4000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await fetcher());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [fetcher]);

  useEffect(() => {
    reload();
    if (ms === null) return;
    const t = setInterval(reload, ms);
    return () => clearInterval(t);
  }, [reload, ms]);

  return { data, error, reload };
}
