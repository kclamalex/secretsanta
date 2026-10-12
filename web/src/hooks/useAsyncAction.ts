import { useCallback, useState } from "react";
import { errorMessage } from "../lib/errors.ts";

/**
 * The busy/error bookkeeping around a user action. `run(fn)` clears the error, marks busy,
 * and turns a throw into `error`. Resolves true when `fn` succeeded.
 */
export function useAsyncAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, setError, run };
}
