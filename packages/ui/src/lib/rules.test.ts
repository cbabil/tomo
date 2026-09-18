import { describe, it, expect } from "vitest";
import { daysSummary, move, ruleName, BLANK_RULE } from "./rules";

describe("rule helpers", () => {
  it("summarises day sets", () => {
    expect(daysSummary(undefined)).toBe("everyDay");
    expect(daysSummary(["fri", "mon", "tue", "wed", "thu"])).toBe("weekdays");
    expect(daysSummary(["sun", "sat"])).toBe("weekends");
    expect(daysSummary(["sun", "mon"])).toEqual(["mon", "sun"]);
  });

  it("names unnamed rules uniquely", () => {
    const rule = { ...BLANK_RULE, effect: "deny" as const, match: { tools: ["apps.restart"], apps: ["nextcloud"] } };
    expect(ruleName(rule, [])).toBe("block-apps-restart-nextcloud");
    expect(ruleName(rule, ["block-apps-restart-nextcloud"])).toBe("block-apps-restart-nextcloud-2");
    expect(ruleName({ ...rule, name: "mine" }, [])).toBe("mine");
  });

  it("moves items without mutating", () => {
    const items = ["a", "b", "c"];
    expect(move(items, 2, 0)).toEqual(["c", "a", "b"]);
    expect(move(items, 0, 5)).toBe(items);
    expect(items).toEqual(["a", "b", "c"]);
  });
});
