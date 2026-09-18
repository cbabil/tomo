import { describe, it, expect } from "vitest";
import { Guardrails, BUILT_IN_RULES, type Rule } from "./guardrails.js";
import type { TokenPrincipal } from "../api-tokens.js";

const manage: TokenPrincipal = { kind: "token", id: "aaa111", name: "claude", scope: "manage" };
const admin: TokenPrincipal = { kind: "token", id: "bbb222", name: "ops", scope: "admin" };

function guardrails(now = () => Date.parse("2026-09-18T12:00:00Z")) {
  return new Guardrails(() => BUILT_IN_RULES, now);
}

describe("Guardrails.evaluate", () => {
  it("allows plain reads", () => {
    expect(guardrails().evaluate("apps.list", {}, manage)).toEqual({ effect: "allow" });
  });

  it("refuses tools above the token's scope before any rule runs", () => {
    const decision = guardrails().evaluate("apps.remove", { appId: "x" }, manage);
    expect(decision.effect).toBe("deny");
    expect(decision.reason).toMatch(/admin/);
  });

  it("asks the agent to restate installs and edits", () => {
    for (const tool of ["apps.install", "apps.update", "apps.add_custom", "apps.edit_custom"]) {
      const decision = guardrails().evaluate(tool, { appId: "x" }, manage);
      expect(decision.effect, tool).toBe("agent_confirm");
      expect(decision.rule, tool).toBe("restate-changes");
    }
  });

  it("sends removal and reach-widening changes to a person for approval", () => {
    expect(guardrails().evaluate("apps.remove", { appId: "x" }, admin).effect).toBe("human_confirm");
    expect(guardrails().evaluate("apps.add_custom", { name: "x", ownAuth: true }, admin)).toMatchObject({
      effect: "human_confirm",
      rule: "widening-needs-a-person",
    });
    expect(
      guardrails().evaluate("apps.edit_custom", { appId: "x", source: { allowPrivileged: true } }, admin).effect,
    ).toBe("human_confirm");
  });

  it("reads rules from a provider, so owner rules apply without a restart", () => {
    let extra: Rule[] = [];
    const g = new Guardrails(() => [...BUILT_IN_RULES, ...extra], () => 0);
    expect(g.evaluate("apps.restart", { appId: "x" }, manage).effect).toBe("allow");
    extra = [{ name: "owner", match: { tools: ["apps.restart"] }, effect: "deny", message: "no" }];
    expect(g.evaluate("apps.restart", { appId: "x" }, manage)).toMatchObject({ effect: "deny", rule: "owner" });
  });

  it("applies the first matching rule", () => {
    const custom = new Guardrails(
      () => [{ name: "night", match: { tools: ["apps.restart"] }, effect: "deny", message: "not at night" }, ...BUILT_IN_RULES],
      () => Date.parse("2026-09-18T12:00:00Z"),
    );
    expect(custom.evaluate("apps.restart", { appId: "x" }, manage)).toMatchObject({
      effect: "deny",
      rule: "night",
      reason: "not at night",
    });
  });

  it("matches on app ids when a rule names them", () => {
    const custom = new Guardrails(
      () => [{ name: "careful", match: { tools: ["apps.restart"], apps: ["nextcloud"] }, effect: "agent_confirm" }],
      () => 0,
    );
    expect(custom.evaluate("apps.restart", { appId: "nextcloud" }, manage).effect).toBe("agent_confirm");
    expect(custom.evaluate("apps.restart", { appId: "gitea" }, manage).effect).toBe("allow");
  });
});

describe("Guardrails rate limits", () => {
  it("limits calls per token per minute, with a tighter limit on changes", () => {
    let now = Date.parse("2026-09-18T12:00:00Z");
    const g = guardrails(() => now);
    for (let i = 0; i < 10; i++) expect(g.evaluate("apps.restart", { appId: "x" }, manage).effect).toBe("allow");
    expect(g.evaluate("apps.restart", { appId: "x" }, manage)).toMatchObject({ effect: "deny", rule: "rate-limit" });
    expect(g.evaluate("apps.list", {}, manage).effect).toBe("allow");

    for (let i = 0; i < 49; i++) g.evaluate("apps.list", {}, manage);
    expect(g.evaluate("apps.list", {}, manage)).toMatchObject({ effect: "deny", rule: "rate-limit" });
    expect(g.evaluate("apps.list", {}, admin).effect).toBe("allow");

    now += 61_000;
    expect(g.evaluate("apps.list", {}, manage).effect).toBe("allow");
  });
});

describe("Guardrails rule flags", () => {
  const night: Rule = { name: "night", match: { tools: ["apps.restart"] }, effect: "deny", message: "no" };

  it("skips disabled rules", () => {
    const g = new Guardrails(() => [{ ...night, enabled: false }, ...BUILT_IN_RULES], () => 0);
    expect(g.evaluate("apps.restart", { appId: "x" }, manage).effect).toBe("allow");
  });

  it("only observes a rule marked observe, reporting what it would have done", () => {
    const g = new Guardrails(() => [{ ...night, observe: true }, ...BUILT_IN_RULES], () => 0);
    expect(g.evaluate("apps.restart", { appId: "x" }, manage)).toEqual({
      effect: "allow",
      rule: "night",
      reason: "no",
      observed: "deny",
    });
  });
});
