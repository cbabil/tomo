import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { parsePolicies, ownerRuleToRule, shadowedRules, PolicyStore, DEFAULT_INSTRUCTIONS } from "./policies.js";
import { BUILT_IN_RULES } from "./guardrails.js";

const NOON = Date.parse("2026-09-18T12:00:00");
const MIDNIGHT_PLUS = Date.parse("2026-09-18T23:30:00");

describe("parsePolicies", () => {
  it("accepts a well-formed rule list", () => {
    const { rules, errors } = parsePolicies(`
- name: no-restarts-at-night
  match:
    tools: [apps.restart]
    apps: [nextcloud]
  when:
    hours: "22:00-07:00"
  effect: deny
  message: Restarts are paused overnight
`);
    expect(errors).toEqual([]);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ name: "no-restarts-at-night", effect: "deny" });
  });

  it("accepts an empty file", () => {
    expect(parsePolicies("")).toEqual({ rules: [], errors: [] });
    expect(parsePolicies("# nothing yet\n")).toEqual({ rules: [], errors: [] });
  });

  it("reports what is wrong instead of throwing", () => {
    expect(parsePolicies("- name: x\n  match:\n    tools: [apps.list]\n  effect: explode\n").errors[0]).toMatch(/effect/);
    expect(parsePolicies("- name: x\n  match:\n    tools: [apps.list]\n  effect: deny\n  when:\n    hours: 22-7\n").errors[0]).toMatch(/hours/);
    expect(parsePolicies("not: [valid").errors[0]).toMatch(/YAML/);
    expect(parsePolicies("key: value\n").errors[0]).toMatch(/list/);
  });
});

describe("ownerRuleToRule", () => {
  const { rules } = parsePolicies(`
- name: night
  match:
    tools: [apps.restart]
  when:
    hours: "22:00-07:00"
  effect: deny
`);

  it("applies a wrap-around time window in local time", () => {
    const rule = ownerRuleToRule(rules[0], () => MIDNIGHT_PLUS);
    expect(rule.match.when?.({})).toBe(true);
    const daytime = ownerRuleToRule(rules[0], () => NOON);
    expect(daytime.match.when?.({})).toBe(false);
  });
});

describe("shadowedRules", () => {
  it("names owner rules a built-in rule already decides for the same tool", () => {
    const { rules } = parsePolicies(`
- name: allow-removal
  match:
    tools: [apps.remove]
  effect: allow
- name: careful-restarts
  match:
    tools: [apps.restart]
  effect: agent_confirm
`);
    expect(shadowedRules(BUILT_IN_RULES, rules)).toEqual([{ rule: "allow-removal", by: "removal-needs-a-person" }]);
  });
});

describe("PolicyStore", () => {
  let dir: string;
  let store: PolicyStore;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "tomo-policies-"));
    store = new PolicyStore(dir, () => NOON);
    await store.load();
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("starts with no owner rules and the default instructions", () => {
    expect(store.rules()).toEqual(BUILT_IN_RULES);
    expect(store.instructions()).toBe(DEFAULT_INSTRUCTIONS);
    expect(store.rulesYaml()).toContain("#");
  });

  it("saves valid rules and instructions to the data directory and applies them", async () => {
    const yaml = "- name: night\n  match:\n    tools: [apps.restart]\n  effect: deny\n";
    await store.save({ rulesYaml: yaml, instructions: "Be careful with Nextcloud." });
    expect(store.rules().map((r) => r.name)).toContain("night");
    expect(store.rules()[0]).toBe(BUILT_IN_RULES[0]);
    expect(await readFile(path.join(dir, "policies.yaml"), "utf-8")).toBe(yaml);
    expect(await readFile(path.join(dir, "agent-instructions.md"), "utf-8")).toBe("Be careful with Nextcloud.");
  });

  it("rejects invalid rules without touching the file", async () => {
    await writeFile(path.join(dir, "policies.yaml"), "- name: keep\n  match:\n    tools: [apps.list]\n  effect: deny\n");
    await store.load();
    await expect(store.save({ rulesYaml: "- name: bad\n  effect: nope\n" })).rejects.toThrow(/effect/);
    expect(store.rules().map((r) => r.name)).toContain("keep");
  });
});

describe("day windows and structured saves", () => {
  const rulesYaml = `
- name: weekend-quiet
  match:
    tools: [apps.restart]
  when:
    hours: "22:00-07:00"
    days: [sat, sun]
  effect: deny
  enabled: true
  observe: false
`;

  it("applies day-of-week windows in local time", () => {
    const { rules, errors } = parsePolicies(rulesYaml);
    expect(errors).toEqual([]);
    const saturdayNight = Date.parse("2026-09-19T23:30:00");
    const mondayNight = Date.parse("2026-09-21T23:30:00");
    expect(ownerRuleToRule(rules[0], () => saturdayNight).match.when?.({})).toBe(true);
    expect(ownerRuleToRule(rules[0], () => mondayNight).match.when?.({})).toBe(false);
  });

  it("rejects unknown day names", () => {
    expect(parsePolicies("- name: x\n  match:\n    tools: [apps.list]\n  when:\n    hours: \"01:00-02:00\"\n    days: [funday]\n  effect: deny\n").errors[0]).toMatch(/days/);
  });

  it("saves structured rules as YAML and evaluates them at a chosen time", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "tomo-policies-"));
    const store = new PolicyStore(dir, () => NOON);
    await store.load();
    await store.saveRules([
      { name: "night", match: { tools: ["apps.restart"], apps: ["nextcloud"] }, when: { hours: "22:00-07:00" }, effect: "deny" },
    ]);
    expect(store.ownerRules()).toHaveLength(1);
    expect(await readFile(path.join(dir, "policies.yaml"), "utf-8")).toContain("nextcloud");
    const atMidnight = store.rulesAt(MIDNIGHT_PLUS).find((r) => r.name === "night");
    const atNoon = store.rulesAt(NOON).find((r) => r.name === "night");
    expect(atMidnight?.match.when?.({})).toBe(true);
    expect(atNoon?.match.when?.({})).toBe(false);
    await rm(dir, { recursive: true, force: true });
  });
});
