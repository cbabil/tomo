/**
 * Guardrails decide what happens when a token asks for a tool: allow it,
 * refuse it, or make the agent restate it first. Rules are data, evaluated
 * first match wins. Built-in rules ship with Tomo; owner rules (a later
 * release) are appended after them, so they can tighten but never loosen.
 */
import { scopeDenial } from "../principal.js";
import { widensReach } from "../schemas.js";
import { TOOLS } from "./tools.js";
import type { TokenPrincipal, TokenScope } from "../api-tokens.js";

export const EFFECTS = ["allow", "deny", "agent_confirm", "human_confirm"] as const;
export type Effect = (typeof EFFECTS)[number];

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
  /** A disabled rule is kept but skipped. */
  enabled?: boolean;
  /** An observed rule never blocks: the call runs and the audit log says what it would have done. */
  observe?: boolean;
}

/**
 * Whether a rule's tool and app selectors cover every one of these tools and
 * apps, ignoring `when`. `apps` omitted means "any app".
 */
export function ruleCovers(rule: Rule, tools: string[], apps?: string[]): boolean {
  const toolsCovered = rule.match.tools.includes("*") || tools.every((t) => rule.match.tools.includes(t));
  const appsCovered = !rule.match.apps || (apps !== undefined && apps.every((a) => rule.match.apps?.includes(a)));
  return toolsCovered && appsCovered;
}

/** Whether a rule applies to this call: selectors plus its `when` condition. */
export function ruleMatches(rule: Rule, tool: string, args: Record<string, unknown>): boolean {
  const apps = typeof args.appId === "string" ? [args.appId] : undefined;
  return ruleCovers(rule, [tool], apps) && (!rule.match.when || rule.match.when(args));
}

export interface Decision {
  effect: Effect;
  rule?: string;
  reason?: string;
  /** Set when an observed rule matched: the effect it would have had. */
  observed?: Effect;
}

/** The first enabled rule that matches, as a decision; allow when none does. */
export function decide(rules: Rule[], tool: string, args: Record<string, unknown>): Decision {
  const rule = rules.find((r) => r.enabled !== false && ruleMatches(r, tool, args));
  if (!rule) return { effect: "allow" };
  if (rule.observe) return { effect: "allow", rule: rule.name, reason: rule.message, observed: rule.effect };
  return { effect: rule.effect, rule: rule.name, reason: rule.message };
}

/** Scope each tool needs. Tools not listed here need `manage`. */
const ADMIN_TOOLS = new Set(["apps.remove"]);

/** Tools that change state, subject to the tighter rate limit. */
const MUTATING_TOOLS = new Set(TOOLS.filter((t) => t.group !== "read").map((t) => t.name));

const CALLS_PER_MINUTE = 60;
const CHANGES_PER_MINUTE = 10;
const WINDOW_MS = 60 * 1000;

/** Rules that ship with Tomo and cannot be removed by the owner. */
export const BUILT_IN_RULES: Rule[] = [
  {
    name: "removal-needs-a-person",
    match: { tools: ["apps.remove"] },
    effect: "human_confirm",
    message: "Removing an app deletes its data, so a person approves it on the Tomo desktop.",
  },
  {
    name: "widening-needs-a-person",
    match: { tools: ["apps.add_custom", "apps.edit_custom"], when: widensReach },
    effect: "human_confirm",
    message: "Privileged mode and own sign-in widen what an app can reach, so a person approves them on the Tomo desktop.",
  },
  {
    name: "restate-changes",
    match: { tools: ["apps.install", "apps.update", "apps.add_custom", "apps.edit_custom"] },
    effect: "agent_confirm",
  },
];

export class Guardrails {
  private readonly calls = new Map<string, number[]>();
  /** `rules` is read on every call, so owner rules can change without a restart. */
  constructor(
    private readonly rules: () => Rule[],
    private readonly now: () => number = Date.now,
  ) {}

  /** Decide a tool call. Scope and rate limits are checked before the rules. */
  evaluate(tool: string, args: Record<string, unknown>, principal: TokenPrincipal): Decision {
    const required: TokenScope = ADMIN_TOOLS.has(tool) ? "admin" : "manage";
    const denial = scopeDenial(principal, required);
    if (denial) return { effect: "deny", rule: "scope", reason: denial };
    const limited = this.overLimit(principal.id, MUTATING_TOOLS.has(tool));
    if (limited) return { effect: "deny", rule: "rate-limit", reason: limited };

    return decide(this.rules(), tool, args);
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
