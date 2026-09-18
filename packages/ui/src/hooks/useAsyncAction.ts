import { useCallback, useState } from "react";

/** Run a change, then refresh; failures land in `error` as a message instead of being thrown. */
export function useAsyncAction(refresh: () => Promise<unknown>) {
  const [error, setError] = useState("");
  const run = useCallback(
    async (work: () => Promise<unknown>) => {
      setError("");
      try {
        await work();
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [refresh],
  );
  return { error, run };
}
