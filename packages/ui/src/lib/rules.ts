/** Rule helpers for the desktop: presets, day summaries, naming, and ordering. Tool groups come from the backend. */
import type { OwnerRule } from "./router-types";

export type Day = NonNullable<NonNullable<OwnerRule["when"]>["days"]>[number];
/** Monday first, the way the day chips read. */
export const DAY_ORDER: Day[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const WEEKDAYS: Day[] = ["mon", "tue", "wed", "thu", "fri"];
const WEEKEND: Day[] = ["sat", "sun"];

const INSTALLS = ["apps.install", "apps.update"];
const CHANGES = ["apps.start", "apps.stop", "apps.restart", ...INSTALLS, "apps.add_custom", "apps.edit_custom", "apps.remove"];

export type RulePresetKey = "quietHours" | "askInstalls" | "handsOff" | "readOnly";
export const RULE_PRESETS: Record<RulePresetKey, OwnerRule> = {
  quietHours: {
    name: "quiet-hours",
    match: { tools: ["apps.restart", "apps.stop", "apps.update"] },
    when: { hours: "22:00-07:00" },
    effect: "deny",
    message: "Quiet hours: try again in the morning",
  },
  askInstalls: { name: "ask-before-installs", match: { tools: INSTALLS }, effect: "human_confirm" },
  handsOff: { name: "hands-off", match: { tools: CHANGES, apps: [] }, effect: "deny", message: "This app is off limits to agents" },
  readOnly: { name: "read-only-agents", match: { tools: CHANGES }, effect: "deny", message: "Agents may only read on this Tomo" },
};

export const BLANK_RULE: OwnerRule = { name: "", match: { tools: [] }, effect: "human_confirm" };

/** "weekdays", "weekends", "everyDay", or the listed days, in week order. */
export function daysSummary(days: Day[] | undefined): "everyDay" | "weekdays" | "weekends" | Day[] {
  if (!days || days.length === 0 || days.length === 7) return "everyDay";
  const sorted = DAY_ORDER.filter((d) => days.includes(d));
  const same = (other: Day[]) => sorted.length === other.length && sorted.every((d, i) => d === other[i]);
  if (same(WEEKDAYS)) return "weekdays";
  if (same(WEEKEND)) return "weekends";
  return sorted;
}

/** A name for a rule the owner did not name, unique among `taken`. */
export function ruleName(rule: OwnerRule, taken: string[]): string {
  const base =
    rule.name.trim() ||
    [rule.effect === "deny" ? "block" : rule.effect === "allow" ? "allow" : "ask", ...rule.match.tools.slice(0, 2), ...(rule.match.apps ?? []).slice(0, 1)]
      .join("-")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
  let name = base || "rule";
  for (let i = 2; taken.includes(name); i++) name = `${base}-${i}`;
  return name;
}

/** Reorder without mutating: the item at `from` lands at `to`. */
export function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = items.filter((_, i) => i !== from);
  return [...next.slice(0, to), items[from], ...next.slice(to)];
}
