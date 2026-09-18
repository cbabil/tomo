import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, userProcedure } from "./middleware.js";
import { BUILT_IN_RULES, decide } from "../mcp/guardrails.js";
import { TOOLS } from "../mcp/tools.js";
import { MAX_INSTRUCTIONS, MAX_RULES_YAML, parsePolicies, shadowedRules, type PolicyStore } from "../mcp/policies.js";
import { ownerRulesSchema } from "../mcp/policy-schema.js";
import type { AuditLog } from "../audit-log.js";
import { approvalProcedures } from "./approvals.js";
import type { Confirmations } from "../mcp/confirmations.js";

const MAX_RULES = 200;

const badRequest = (err: unknown) =>
  new TRPCError({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : String(err) });

/** Guardrails and approvals. Every procedure is for a signed-in person only. */
export function createGuardrailsRouter(policies: PolicyStore, confirmations: Confirmations, audit: AuditLog) {
  const recordSave = (name: string, args: unknown) =>
    audit.record({ principal: { kind: "user", name }, action: "guardrails.save", args, outcome: "ok" });

  return router({
    /** Built-in rules (locked), the owner's rules and YAML, the agent instructions, and rules with no effect. */
    get: userProcedure.query(() => ({
      builtIn: BUILT_IN_RULES.map(({ name, match, effect, message }) => ({ name, tools: match.tools, effect, message })),
      rules: policies.ownerRules(),
      rulesYaml: policies.rulesYaml(),
      instructions: policies.instructions(),
      shadowed: shadowedRules(BUILT_IN_RULES, policies.ownerRules()),
    })),

    /** The tools agents can call, for pickers. */
    tools: userProcedure.query(() => TOOLS.map(({ name, description, group }) => ({ name, description, group }))),

    /** Validate owner YAML without saving, for feedback while editing. */
    check: userProcedure.input(z.object({ rulesYaml: z.string().max(MAX_RULES_YAML) })).query(({ input }) => {
      const { rules, errors } = parsePolicies(input.rulesYaml);
      return { errors, shadowed: shadowedRules(BUILT_IN_RULES, rules), count: rules.length };
    }),

    /** What the rules would decide for a call, at a chosen moment. Scope and rate limits are not applied. */
    try: userProcedure
      .input(z.object({ tool: z.string(), appId: z.string().optional(), at: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Invalid time").optional() }))
      .query(({ input }) => {
        const at = input.at ? Date.parse(input.at) : Date.now();
        return decide(policies.rulesAt(at), input.tool, input.appId ? { appId: input.appId } : {});
      }),

    save: userProcedure
      .input(
        z.object({
          rulesYaml: z.string().max(MAX_RULES_YAML).optional(),
          instructions: z.string().max(MAX_INSTRUCTIONS).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        await policies.save(input).catch((err) => {
          throw badRequest(err);
        });
        await recordSave(ctx.user.sub, { rules: input.rulesYaml !== undefined, instructions: input.instructions !== undefined });
        return { success: true };
      }),

    /** Save rules built on the desktop as a whole, in order. */
    saveRules: userProcedure.input(z.object({ rules: ownerRulesSchema.max(MAX_RULES) })).mutation(async ({ input, ctx }) => {
      await policies.saveRules(input.rules).catch((err) => {
        throw badRequest(err);
      });
      await recordSave(ctx.user.sub, { rules: true, count: input.rules.length });
      return { success: true };
    }),

    ...approvalProcedures(policies, confirmations, audit),
  });
}
