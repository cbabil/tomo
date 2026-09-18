/**
 * The owner's guardrail rules as written in policies.yaml: their schema,
 * parsing with readable errors, and the turn into runtime rules with time
 * windows. Built-in rules always come first, so owners tighten but never
 * loosen.
 */
import yaml from "js-yaml";
import { z } from "zod";
import { EFFECTS, type Rule, ruleCovers } from "./guardrails.js";
import { appIdSchema } from "../schemas.js";

export const DEFAULT_RULES_YAML = `# Your guardrails. Built-in rules run first and cannot be loosened here.
# Each rule: name, match (tools, optional apps), optional when (hours, days), effect, optional message.
# Effects: allow, deny, agent_confirm (the agent restates), human_confirm (you approve on the desktop).
# Optional flags: enabled: false keeps a rule without applying it; observe: true only logs what it would do.
#
# - name: no-restarts-at-night
#   match:
#     tools: [apps.restart]
#     apps: [nextcloud]
#   when:
#     hours: "22:00-07:00"
#     days: [mon, tue, wed, thu, fri]
#   effect: deny
#   message: Restarts are paused overnight
`;

export const DEFAULT_INSTRUCTIONS = `You are operating a Tomo server on someone's home network.
Explain what an app does before installing it. Prefer apps from the store over custom compose files.
Do not restart apps that are in use without saying so first. When unsure, ask.`;

export const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const HOURS = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/;

const OwnerRuleSchema = z.object({
  name: z.string().min(1).max(64),
  match: z.object({
    tools: z.array(z.string().min(1)).min(1),
    apps: z.array(appIdSchema).optional(),
  }),
  when: z
    .object({
      hours: z.string().regex(HOURS, 'hours must look like "22:00-07:00"').optional(),
      days: z.array(z.enum(DAYS)).min(1).optional(),
    })
    .optional(),
  effect: z.enum(EFFECTS),
  message: z.string().max(200).optional(),
  enabled: z.boolean().optional(),
  observe: z.boolean().optional(),
});
export type OwnerRule = z.infer<typeof OwnerRuleSchema>;
export const ownerRulesSchema = z.array(OwnerRuleSchema);

/** Parse the owner's YAML. Errors are messages, one per problem, never thrown. */
export function parsePolicies(text: string): { rules: OwnerRule[]; errors: string[] } {
  let doc: unknown;
  try {
    doc = yaml.load(text);
  } catch (err) {
    return { rules: [], errors: [`Invalid YAML: ${err instanceof Error ? err.message : String(err)}`] };
  }
  if (doc === undefined || doc === null) return { rules: [], errors: [] };
  if (!Array.isArray(doc)) return { rules: [], errors: ["The file must be a list of rules"] };
  const parsed = ownerRulesSchema.safeParse(doc);
  if (parsed.success) return { rules: parsed.data, errors: [] };
  return {
    rules: [],
    errors: parsed.error.issues.map((issue) => `Rule ${issue.path[0] ?? "?"}: ${issue.path.slice(1).join(".")} ${issue.message}`),
  };
}

/** Owner rules as YAML, the way the desktop writes them. */
export function dumpPolicies(rules: OwnerRule[]): string {
  return rules.length === 0 ? "" : yaml.dump(rules, { lineWidth: 100, noRefs: true });
}

/** True when the local time at `at` falls inside the window; hours may wrap past midnight. */
export function inWindow(when: NonNullable<OwnerRule["when"]>, at: number): boolean {
  const d = new Date(at);
  if (when.days && !when.days.includes(DAYS[d.getDay()])) return false;
  if (!when.hours) return true;
  const [, h1, m1, h2, m2] = HOURS.exec(when.hours) ?? [];
  const start = Number(h1) * 60 + Number(m1);
  const end = Number(h2) * 60 + Number(m2);
  const minutes = d.getHours() * 60 + d.getMinutes();
  return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

/** Turn an owner rule into a runtime rule; time windows read the clock on every call. */
export function ownerRuleToRule(rule: OwnerRule, now: () => number): Rule {
  const when = rule.when;
  return {
    name: rule.name,
    match: {
      tools: rule.match.tools,
      apps: rule.match.apps,
      ...(when && { when: () => inWindow(when, now()) }),
    },
    effect: rule.effect,
    message: rule.message,
    enabled: rule.enabled,
    observe: rule.observe,
  };
}

/** Owner rules that can never take effect because a built-in rule already decides those tools. */
export function shadowedRules(builtIn: Rule[], owner: OwnerRule[]): Array<{ rule: string; by: string }> {
  return owner.flatMap((rule) => {
    const by = builtIn.find((b) => !b.match.when && ruleCovers(b, rule.match.tools, rule.match.apps));
    return by ? [{ rule: rule.name, by: by.name }] : [];
  });
}
