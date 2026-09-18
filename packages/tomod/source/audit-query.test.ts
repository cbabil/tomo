import { describe, it, expect } from "vitest";
import { filterEntries, countOutcomes, digest, type AuditFilter } from "./audit-query.js";
import type { AuditEntry } from "./audit-log.js";

const NOW = Date.parse("2026-09-18T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const at = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
const entry = (over: Partial<AuditEntry>): AuditEntry => ({
  time: at(0),
  principal: { kind: "token", id: "t1", name: "claude" },
  action: "mcp:apps.restart",
  outcome: "ok",
  ...over,
});
const entries: AuditEntry[] = [
  entry({ time: at(0) }),
  entry({ time: at(1), outcome: "denied", rule: "night" }),
  entry({ time: at(2), principal: { kind: "token", id: "t2", name: "script" } }),
  entry({ time: at(9), outcome: "error" }),
  entry({ time: at(20), principal: { kind: "user", name: "pi" }, action: "tokens.create" }),
];

describe("filterEntries", () => {
  it("keeps everything with an empty filter", () => {
    expect(filterEntries(entries, {}, NOW)).toHaveLength(5);
  });

  it("filters by token, outcome, and age", () => {
    const filter: AuditFilter = { tokenId: "t1", outcomes: ["ok", "denied"], days: 7 };
    expect(filterEntries(entries, filter, NOW).map((e) => e.time)).toEqual([at(0), at(1)]);
  });
});

describe("countOutcomes", () => {
  it("counts each outcome present", () => {
    expect(countOutcomes(entries)).toEqual({ ok: 3, denied: 1, error: 1 });
  });
});

describe("digest", () => {
  it("compares this week with the week before, agent calls only", () => {
    expect(digest(entries, NOW)).toEqual({ actions: 3, refused: 1, previousActions: 1 });
  });
});
