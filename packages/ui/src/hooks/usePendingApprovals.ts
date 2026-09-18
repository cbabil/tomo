import { trpc } from "../lib/trpc";

const POLL_MS = 5000;

/** Agent requests waiting for a person, refreshed every few seconds while the tab is visible. */
export function usePendingApprovals() {
  return trpc.guardrails.pendingApprovals.useQuery(undefined, {
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
  });
}
