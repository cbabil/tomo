/**
 * Approval procedures: what agents are waiting on, and the owner's decision.
 * A decision can also become a standing rule, except where a built-in rule
 * insists on a person every time.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { userProcedure } from "./middleware.js";
import { BUILT_IN_RULES } from "../mcp/guardrails.js";
import type { PolicyStore } from "../mcp/policies.js";
import type { OwnerRule } from "../mcp/policy-schema.js";
import { redact, type AuditLog } from "../audit-log.js";
import type { Confirmations, PendingConfirmation } from "../mcp/confirmations.js";

const REMEMBER = ["allow", "human_confirm"] as const;

/** A rule that repeats this decision for the same tool and app from now on. */
function ruleFromDecision(pending: PendingConfirmation, effect: (typeof REMEMBER)[number]): OwnerRule {
  const appId = typeof pending.args.appId === "string" ? pending.args.appId : undefined;
  const verb = effect === "allow" ? "allow" : "ask";
  return {
    name: `${verb}-${pending.tool.replace(/\W+/g, "-")}${appId ? `-${appId}` : ""}`,
    match: { tools: [pending.tool], ...(appId && { apps: [appId] }) },
    effect,
    message: `Set from an approval on ${new Date().toLocaleDateString()}`,
  };
}

export function approvalProcedures(policies: PolicyStore, confirmations: Confirmations, audit: AuditLog) {
  return {
    /** Arguments are masked like everything else that leaves Tomo: a compose file may carry secrets. */
    pendingApprovals: userProcedure.query(() => confirmations.awaitingPerson().map((p) => ({ ...p, args: redact(p.args) as Record<string, unknown> }))),

    decide: userProcedure
      .input(
        z.object({
          id: z.string(),
          approved: z.boolean(),
          reason: z.string().max(200).optional(),
          /** Remember this decision as a rule for the same tool and app. */
          remember: z.enum(REMEMBER).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        let decided: PendingConfirmation;
        try {
          decided = confirmations.decide(input.id, input.approved, ctx.user.sub, input.reason);
        } catch (err) {
          throw new TRPCError({ code: "NOT_FOUND", message: err instanceof Error ? err.message : String(err) });
        }
        await audit.record({
          principal: { kind: "user", name: ctx.user.sub },
          action: input.approved ? "approvals.approve" : "approvals.deny",
          args: { id: decided.id, tool: decided.tool, token: decided.tokenId },
          outcome: "ok",
          reason: input.reason,
          rule: decided.rule,
        });
        if (input.remember) await remember(decided, input.remember);
        return { success: true };
      }),
  };

  async function remember(decided: PendingConfirmation, effect: (typeof REMEMBER)[number]): Promise<void> {
    if (BUILT_IN_RULES.some((r) => r.name === decided.rule)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "A built-in rule asks for a person every time; this cannot be remembered" });
    }
    const rule = ruleFromDecision(decided, effect);
    const existing = policies.ownerRules().filter((r) => r.name !== rule.name);
    await policies.saveRules([rule, ...existing]);
  }
}
