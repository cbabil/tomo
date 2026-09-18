import { describe, it, expect } from "vitest";
import type { TFunction } from "i18next";
import { describeEntry, groupByAgent, groupByDay, entryTool } from "./activity";
import type { AuditEntry } from "./router-types";

const labels: Record<string, string> = {
  "rules.tools.apps.restart": "restarts",
  "rules.tools.apps.logs": "reads logs",
  "rules.tools.apps.list": "lists apps",
  "rules.sentence.on": "on",
  "activity.row.guardrails.save": "Saved rules",
};
const t = ((key: string, opts?: { defaultValue?: string }) => labels[key] ?? opts?.defaultValue ?? key) as unknown as TFunction;
const takesApp = (tool: string) => tool === "apps.restart";
const entry = (over: Partial<AuditEntry>): AuditEntry => ({
  time: "2026-09-18T10:00:00",
  principal: { kind: "token", id: "t1", name: "claude" },
  action: "mcp:apps.restart",
  outcome: "ok",
  ...over,
});

describe("describeEntry", () => {
  it("writes a sentence from the tool and the app", () => {
    expect(entryTool(entry({}))).toBe("apps.restart");
    expect(describeEntry(entry({ args: { appId: "gitea" } }), t, { gitea: "Gitea" }, takesApp)).toBe("Restarts Gitea");
    expect(describeEntry(entry({ action: "mcp:apps.logs", args: { appId: "gitea" } }), t, {}, takesApp)).toBe("Reads logs on gitea");
    expect(describeEntry(entry({ action: "mcp:apps.list" }), t, {}, takesApp)).toBe("Lists apps");
    expect(describeEntry(entry({ action: "guardrails.save" }), t, {}, takesApp)).toBe("Saved rules");
    expect(describeEntry(entry({ action: "something.else" }), t, {}, takesApp)).toBe("something.else");
  });
});

describe("grouping", () => {
  const entries = [
    entry({ time: "2026-09-18T10:00:00" }),
    entry({ time: "2026-09-18T09:00:00", outcome: "denied" }),
    entry({ time: "2026-09-17T23:00:00", principal: { kind: "user", name: "pi" }, action: "guardrails.save" }),
  ];

  it("groups by local day, newest first", () => {
    expect(groupByDay(entries).map((g) => [g.day, g.entries.length])).toEqual([["2026-09-18", 2], ["2026-09-17", 1]]);
  });

  it("summarises per caller, busiest first", () => {
    expect(groupByAgent(entries).map((g) => [g.name, g.calls, g.refused])).toEqual([["claude", 2, 1], ["pi", 1, 0]]);
  });
});
