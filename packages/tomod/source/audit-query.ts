/**
 * Read-side helpers for the audit log: filtering, counts by outcome, and a
 * weekly digest. Pure functions over entries, so the UI's activity views
 * share one definition of "this week" and "refused".
 */
import type { AuditEntry } from "./audit-log.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const REFUSED: ReadonlyArray<AuditEntry["outcome"]> = ["denied", "error"];

export interface AuditFilter {
  tokenId?: string;
  outcomes?: AuditEntry["outcome"][];
  /** Only entries from the last this many days. */
  days?: number;
  limit?: number;
}

export interface AuditDigest {
  /** Agent calls in the last seven days. */
  actions: number;
  /** Of those, how many were refused or failed. */
  refused: number;
  /** Agent calls in the seven days before that, for comparison. */
  previousActions: number;
}

export function filterEntries(entries: AuditEntry[], filter: AuditFilter, now: number): AuditEntry[] {
  const since = filter.days === undefined ? undefined : now - filter.days * DAY_MS;
  const kept = entries.filter(
    (e) =>
      (filter.tokenId === undefined || e.principal.id === filter.tokenId) &&
      (filter.outcomes === undefined || filter.outcomes.includes(e.outcome)) &&
      (since === undefined || Date.parse(e.time) >= since),
  );
  return filter.limit === undefined ? kept : kept.slice(0, filter.limit);
}

export function countOutcomes(entries: AuditEntry[]): Partial<Record<AuditEntry["outcome"], number>> {
  const counts: Partial<Record<AuditEntry["outcome"], number>> = {};
  for (const e of entries) counts[e.outcome] = (counts[e.outcome] ?? 0) + 1;
  return counts;
}

/** What agents did this week against last week. Owner actions are left out. */
export function digest(entries: AuditEntry[], now: number): AuditDigest {
  const agent = entries.filter((e) => e.principal.kind === "token");
  const thisWeek = agent.filter((e) => Date.parse(e.time) >= now - WEEK_MS);
  const lastWeek = agent.filter((e) => {
    const t = Date.parse(e.time);
    return t < now - WEEK_MS && t >= now - 2 * WEEK_MS;
  });
  return {
    actions: thisWeek.length,
    refused: thisWeek.filter((e) => REFUSED.includes(e.outcome)).length,
    previousActions: lastWeek.length,
  };
}
