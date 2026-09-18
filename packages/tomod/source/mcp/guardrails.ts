/**
 * Guardrails decide what happens when a token asks for a tool: allow it,
 * refuse it, or make the agent restate it first. Rules are data, evaluated
 * first match wins. Built-in rules ship with Tomo; owner rules (a later
 * release) are appended after them, so they can tighten but never loosen.
 */
import { scopeDenial } from "../principal.js";
import { widensReach } from "../schemas.js";
import type { TokenPrincipal, TokenScope } from "../api-tokens.js";

export type Effect = "allow" | "deny" | "agent_confirm";

export interface Rule {
  name: string;
  match: {
    /** Tool names, or "*" for every tool. */
    tools: string[];
    /** App ids the rule applies to; omitted means any. */
    apps?: string[];
    /** Extra condition on the call's arguments. */
    when?: (args: Record<string, unknown>) => boolean;
  };
  effect: Effect;
  message?: string;
}

export interface Decision {
  effect: Effect;
  rule?: string;
  reason?: string;
}

/** Scope each tool needs. Tools not listed here need `manage`. */
const ADMIN_TOOLS = new Set(["apps.remove"]);

/** Tools that change state, subject to the tighter rate limit. */
const MUTATING_TOOLS = new Set([
  "apps.start",
  "apps.stop",
  "apps.restart",
  "apps.update",
  "apps.install",
  "apps.add_custom",
  "apps.edit_custom",
  "apps.remove",
]);

const CALLS_PER_MINUTE = 60;
const CHANGES_PER_MINUTE = 10;
const WINDOW_MS = 60 * 1000;

/** Rules that ship with Tomo and cannot be removed by the owner. */
export const BUILT_IN_RULES: Rule[] = [
  {
    name: "removal-needs-a-person",
    match: { tools: ["apps.remove"] },
    effect: "deny",
    message: "Removing an app deletes its data. Do it from the Tomo desktop.",
  },
  {
    name: "widening-needs-a-person",
    match: { tools: ["apps.add_custom", "apps.edit_custom"], when: widensReach },
    effect: "deny",
    message: "Privileged mode and own sign-in widen what an app can reach. Turn them on from the Tomo desktop.",
  },
  {
    name: "restate-changes",
    match: { tools: ["apps.install", "apps.update", "apps.add_custom", "apps.edit_custom"] },
    effect: "agent_confirm",
  },
];

export class Guardrails {
  private readonly calls = new Map<string, number[]>();

  constructor(
    private readonly rules: Rule[],
    private readonly now: () => number = Date.now,
  ) {}

  /** Decide a tool call. Scope and rate limits are checked before the rules. */
  evaluate(tool: string, args: Record<string, unknown>, principal: TokenPrincipal): Decision {
    const required: TokenScope = ADMIN_TOOLS.has(tool) ? "admin" : "manage";
    const denial = scopeDenial(principal, required);
    if (denial) return { effect: "deny", rule: "scope", reason: denial };
    const limited = this.overLimit(principal.id, MUTATING_TOOLS.has(tool));
    if (limited) return { effect: "deny", rule: "rate-limit", reason: limited };

    const appId = typeof args.appId === "string" ? args.appId : undefined;
    const rule = this.rules.find(
      (r) =>
        (r.match.tools.includes("*") || r.match.tools.includes(tool)) &&
        (!r.match.apps || (appId !== undefined && r.match.apps.includes(appId))) &&
        (!r.match.when || r.match.when(args)),
    );
    if (!rule) return { effect: "allow" };
    return { effect: rule.effect, rule: rule.name, reason: rule.message };
  }

  /** Record the call and report a limit message when this token is over it. */
  private overLimit(tokenId: string, mutating: boolean): string | undefined {
    const since = this.now() - WINDOW_MS;
    const all = (this.calls.get(`${tokenId}`) ?? []).filter((t) => t > since);
    const changes = (this.calls.get(`${tokenId}:changes`) ?? []).filter((t) => t > since);
    if (all.length >= CALLS_PER_MINUTE) return `More than ${CALLS_PER_MINUTE} calls in a minute; slow down`;
    if (mutating && changes.length >= CHANGES_PER_MINUTE) {
      return `More than ${CHANGES_PER_MINUTE} changes in a minute; slow down`;
    }
    this.calls.set(`${tokenId}`, [...all, this.now()]);
    if (mutating) this.calls.set(`${tokenId}:changes`, [...changes, this.now()]);
    this.forgetIdle(since);
    return undefined;
  }

  /** Drop tokens with no calls in the window, so the map does not grow forever. */
  private forgetIdle(since: number): void {
    for (const [key, times] of this.calls) {
      if (!times.some((t) => t > since)) this.calls.delete(key);
    }
  }
}
