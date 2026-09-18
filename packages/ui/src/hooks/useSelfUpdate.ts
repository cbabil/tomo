import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "../lib/trpc";

const POLL_MS = 2_000;
/** Past this, the screen says the update is slow and offers a reload instead of waiting silently. */
const SLOW_AFTER_MS = 3 * 60_000;

export type UpdatePhase = "idle" | "downloading" | "restarting" | "slow" | "failed";

/**
 * Update Tomo in place: download, then wait until the restarted daemon
 * reports the new version before reloading, so the page never reloads into
 * the old one.
 */
export function useSelfUpdate() {
  const { client } = trpc.useUtils();
  const update = trpc.system.update.useMutation();
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const stopped = useRef(false);

  useEffect(
    () => () => {
      stopped.current = true;
      clearTimeout(timer.current);
    },
    [],
  );

  /** The version Tomo reports right now, or undefined while it is restarting. */
  const runningVersion = useCallback(
    () => client.system.version.query().then((v) => v.current, () => undefined),
    [client],
  );

  /** Ask again only after the last answer came back, so slow answers during the restart never pile up. */
  const waitFor = useCallback(
    (target: string, started: number) => {
      timer.current = setTimeout(async () => {
        if ((await runningVersion()) === target) return window.location.reload();
        if (stopped.current) return;
        if (Date.now() - started > SLOW_AFTER_MS) setPhase("slow");
        waitFor(target, started);
      }, POLL_MS);
    },
    [runningVersion],
  );

  const start = useCallback(
    async (target: string) => {
      setError("");
      setPhase("downloading");
      try {
        await update.mutateAsync();
      } catch (err) {
        // The daemon may restart before it answers; only a clear refusal is a failure.
        if ((await runningVersion()) !== undefined) {
          setError(err instanceof Error ? err.message : String(err));
          setPhase("failed");
          return;
        }
      }
      setPhase("restarting");
      waitFor(target, Date.now());
    },
    [update, runningVersion, waitFor],
  );

  return { phase, error, start, busy: phase === "downloading" || phase === "restarting" || phase === "slow" };
}
