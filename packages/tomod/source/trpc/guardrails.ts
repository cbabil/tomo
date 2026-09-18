import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, userProcedure } from "./middleware.js";
import { BUILT_IN_RULES } from "../mcp/guardrails.js";
import { MAX_INSTRUCTIONS, MAX_RULES_YAML, parsePolicies, shadowedRules, type PolicyStore } from "../mcp/policies.js";
import type { Confirmations } from "../mcp/confirmations.js";
import type { AuditLog } from "../audit-log.js";

/** Guardrails and approvals. Every procedure is for a signed-in person only. */
export function createGuardrailsRouter(policies: PolicyStore, confirmations: Confirmations, audit: AuditLog) {
  return router({
    /** Built-in rules (locked), the owner's YAML, the agent instructions, and rules with no effect. */
    get: userProcedure.query(() => ({
      builtIn: BUILT_IN_RULES.map(({ name, match, effect, message }) => ({
        name,
        tools: match.tools,
        effect,
        message,
      })),
      rulesYaml: policies.rulesYaml(),
      instructions: policies.instructions(),
      shadowed: shadowedRules(BUILT_IN_RULES, policies.ownerRules()),
    })),

    /** Validate owner YAML without saving, for feedback while editing. */
    check: userProcedure
      .input(z.object({ rulesYaml: z.string().max(MAX_RULES_YAML) }))
      .query(({ input }) => {
        const { rules, errors } = parsePolicies(input.rulesYaml);
        return { errors, shadowed: shadowedRules(BUILT_IN_RULES, rules), count: rules.length };
      }),

    save: userProcedure
      .input(
        z.object({
          rulesYaml: z.string().max(MAX_RULES_YAML).optional(),
          instructions: z.string().max(MAX_INSTRUCTIONS).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        try {
          await policies.save(input);
        } catch (err) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : String(err) });
        }
        await audit.record({
          principal: { kind: "user", name: ctx.user.sub },
          action: "guardrails.save",
          args: { rules: input.rulesYaml !== undefined, instructions: input.instructions !== undefined },
          outcome: "ok",
        });
        return { success: true };
      }),

    pendingApprovals: userProcedure.query(() => confirmations.awaitingPerson()),

    decide: userProcedure
      .input(z.object({ id: z.string(), approved: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        let decided;
        try {
          decided = confirmations.decide(input.id, input.approved, ctx.user.sub);
        } catch (err) {
          throw new TRPCError({ code: "NOT_FOUND", message: err instanceof Error ? err.message : String(err) });
        }
        await audit.record({
          principal: { kind: "user", name: ctx.user.sub },
          action: input.approved ? "approvals.approve" : "approvals.deny",
          args: { id: decided.id, tool: decided.tool, token: decided.tokenId },
          outcome: "ok",
        });
        return { success: true };
      }),
  });
}
