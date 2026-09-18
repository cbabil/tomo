/**
 * Owner-editable guardrails. `policies.yaml` holds enforced rules in the
 * same shape as the built-in ones; `agent-instructions.md` holds advice in
 * prose that every agent receives when it connects. Both live in the data
 * directory and are edited from Settings or by hand.
 */
import path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import { createLogger } from "../logger.js";
import { readOptionalFile, writeFileAtomic } from "../fs-utils.js";
import { BUILT_IN_RULES, EFFECTS, type Rule, ruleCovers } from "./guardrails.js";

const log = createLogger("policies");

const RULES_FILE = "policies.yaml";
const INSTRUCTIONS_FILE = "agent-instructions.md";
export const MAX_RULES_YAML = 64_000;
export const MAX_INSTRUCTIONS = 64_000;

export const DEFAULT_RULES_YAML = `# Your guardrails. Built-in rules run first and cannot be loosened here.
# Each rule: name, match (tools, optional apps), optional when (hours), effect, optional message.
# Effects: allow, deny, agent_confirm (the agent restates), human_confirm (you approve on the desktop).
#
# - name: no-restarts-at-night
#   match:
#     tools: [apps.restart]
#     apps: [nextcloud]
#   when:
#     hours: "22:00-07:00"
#   effect: deny
#   message: Restarts are paused overnight
`;

export const DEFAULT_INSTRUCTIONS = `You are operating a Tomo server on someone's home network.
Explain what an app does before installing it. Prefer apps from the store over custom compose files.
Do not restart apps that are in use without saying so first. When unsure, ask.`;

const HOURS = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/;

const OwnerRuleSchema = z.object({
  name: z.string().min(1).max(64),
  match: z.object({
    tools: z.array(z.string().min(1)).min(1),
    apps: z.array(z.string().min(1)).optional(),
  }),
  when: z.object({ hours: z.string().regex(HOURS, 'hours must look like "22:00-07:00"') }).optional(),
  effect: z.enum(EFFECTS),
  message: z.string().max(200).optional(),
});
export type OwnerRule = z.infer<typeof OwnerRuleSchema>;

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
  const parsed = z.array(OwnerRuleSchema).safeParse(doc);
  if (parsed.success) return { rules: parsed.data, errors: [] };
  return {
    rules: [],
    errors: parsed.error.issues.map((issue) => `Rule ${issue.path[0] ?? "?"}: ${issue.path.slice(1).join(".")} ${issue.message}`),
  };
}

function minutesOfDay(at: number): number {
  const d = new Date(at);
  return d.getHours() * 60 + d.getMinutes();
}

/** True when the local time at `now()` falls inside "HH:MM-HH:MM", which may wrap past midnight. */
function inHours(window: string, now: () => number): boolean {
  const [, h1, m1, h2, m2] = HOURS.exec(window) ?? [];
  const start = Number(h1) * 60 + Number(m1);
  const end = Number(h2) * 60 + Number(m2);
  const current = minutesOfDay(now());
  return start <= end ? current >= start && current < end : current >= start || current < end;
}

export function ownerRuleToRule(rule: OwnerRule, now: () => number): Rule {
  const hours = rule.when?.hours;
  return {
    name: rule.name,
    match: {
      tools: rule.match.tools,
      apps: rule.match.apps,
      ...(hours && { when: () => inHours(hours, now) }),
    },
    effect: rule.effect,
    message: rule.message,
  };
}

/** Owner rules that can never take effect because a built-in rule already decides those tools. */
export function shadowedRules(builtIn: Rule[], owner: OwnerRule[]): Array<{ rule: string; by: string }> {
  return owner.flatMap((rule) => {
    const by = builtIn.find((b) => !b.match.when && ruleCovers(b, rule.match.tools, rule.match.apps));
    return by ? [{ rule: rule.name, by: by.name }] : [];
  });
}

export class PolicyStore {
  private ownerYaml = DEFAULT_RULES_YAML;
  private owner: OwnerRule[] = [];
  private merged: Rule[] = BUILT_IN_RULES;
  private text = DEFAULT_INSTRUCTIONS;

  constructor(
    private readonly dataDir: string,
    private readonly now: () => number = Date.now,
  ) {}

  async load(): Promise<void> {
    const [rulesYaml, instructions] = await Promise.all([this.read(RULES_FILE), this.read(INSTRUCTIONS_FILE)]);
    if (rulesYaml !== undefined) {
      const { rules, errors } = parsePolicies(rulesYaml);
      if (errors.length > 0) log.error("policies.yaml has errors; owner rules are ignored", { errors });
      this.apply(rulesYaml, errors.length > 0 ? [] : rules);
    }
    if (instructions !== undefined) this.text = instructions;
  }

  /** Built-in rules first, then the owner's, so owners tighten but never loosen. */
  rules(): Rule[] {
    return this.merged;
  }

  rulesYaml(): string {
    return this.ownerYaml;
  }

  ownerRules(): OwnerRule[] {
    return this.owner;
  }

  instructions(): string {
    return this.text;
  }

  /** Validate, write, and apply. Invalid rules are rejected and nothing changes. */
  async save(input: { rulesYaml?: string; instructions?: string }): Promise<void> {
    const { rulesYaml, instructions } = input;
    if (rulesYaml !== undefined && rulesYaml.length > MAX_RULES_YAML) throw new Error("Rules file is too large");
    if (instructions !== undefined && instructions.length > MAX_INSTRUCTIONS) throw new Error("Instructions are too large");
    const parsed = rulesYaml === undefined ? undefined : parsePolicies(rulesYaml);
    if (parsed && parsed.errors.length > 0) throw new Error(parsed.errors.join("\n"));

    await Promise.all([
      rulesYaml !== undefined && writeFileAtomic(path.join(this.dataDir, RULES_FILE), rulesYaml),
      instructions !== undefined && writeFileAtomic(path.join(this.dataDir, INSTRUCTIONS_FILE), instructions),
    ]);
    if (rulesYaml !== undefined && parsed) {
      this.apply(rulesYaml, parsed.rules);
      log.info("Owner guardrails saved", { rules: parsed.rules.length });
    }
    if (instructions !== undefined) {
      this.text = instructions;
      log.info("Agent instructions saved");
    }
  }

  /** Remember the owner's rules and build the merged list once, not on every tool call. */
  private apply(rulesYaml: string, owner: OwnerRule[]): void {
    this.ownerYaml = rulesYaml;
    this.owner = owner;
    this.merged = [...BUILT_IN_RULES, ...owner.map((r) => ownerRuleToRule(r, this.now))];
  }

  private read(file: string): Promise<string | undefined> {
    return readOptionalFile(path.join(this.dataDir, file), (error) => log.error(`Could not read ${file}`, { error }));
  }
}
