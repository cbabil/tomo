/**
 * The owner's guardrails on disk: policies.yaml with their rules and
 * agent-instructions.md with advice for agents. Loaded at startup, saved
 * from the desktop, and applied at once.
 */
import path from "node:path";
import { createLogger } from "../logger.js";
import { readOptionalFile, writeFileAtomic } from "../fs-utils.js";
import { BUILT_IN_RULES, type Rule } from "./guardrails.js";
import {
  DEFAULT_INSTRUCTIONS,
  DEFAULT_RULES_YAML,
  dumpPolicies,
  ownerRuleToRule,
  parsePolicies,
  type OwnerRule,
} from "./policy-schema.js";

export { DEFAULT_INSTRUCTIONS, DEFAULT_RULES_YAML, ownerRuleToRule, parsePolicies, shadowedRules } from "./policy-schema.js";
export type { OwnerRule } from "./policy-schema.js";

const log = createLogger("policies");

const RULES_FILE = "policies.yaml";
const INSTRUCTIONS_FILE = "agent-instructions.md";
export const MAX_RULES_YAML = 64_000;
export const MAX_INSTRUCTIONS = 64_000;

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

  /** The same rules with time windows evaluated at a fixed moment, for "try a request". */
  rulesAt(at: number): Rule[] {
    return [...BUILT_IN_RULES, ...this.owner.map((r) => ownerRuleToRule(r, () => at))];
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

  /** Save rules built on the desktop; they are written as YAML so the file stays the source of truth. */
  saveRules(rules: OwnerRule[]): Promise<void> {
    return this.save({ rulesYaml: dumpPolicies(rules) });
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
