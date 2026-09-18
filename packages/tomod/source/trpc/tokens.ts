import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, userProcedure } from "./middleware.js";
import { TOKEN_SCOPES, type ApiTokens } from "../api-tokens.js";
import { AUDIT_OUTCOMES, type AuditLog } from "../audit-log.js";
import { MAX_NOTE } from "../token-record.js";
import { countOutcomes, digest } from "../audit-query.js";

const MAX_TOKEN_NAME = 64;
const MAX_ACTIVITY = 500;
const MAX_DAYS = 90;
/** null means the token never expires. */
const expirySchema = z.number().int().min(1).max(3650).nullable();
const outcomeSchema = z.enum(AUDIT_OUTCOMES);
const MINUTE_MS = 60 * 1000;

/** Tokens and the audit log. Every procedure is for a signed-in person only. */
export function createTokensRouter(tokens: ApiTokens, audit: AuditLog) {
  const recordByUser = (name: string, action: string, args: unknown) =>
    audit.record({ principal: { kind: "user", name }, action, args, outcome: "ok" });

  return router({
    list: userProcedure.query(() => tokens.list()),

    create: userProcedure
      .input(
        z.object({
          name: z.string().trim().min(1).max(MAX_TOKEN_NAME),
          scope: z.enum(TOKEN_SCOPES),
          expiresInDays: expirySchema,
          note: z.string().max(MAX_NOTE).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const created = await tokens.create(input);
        if (input.note) await tokens.update(created.record.id, { note: input.note });
        await recordByUser(ctx.user.sub, "tokens.create", { id: created.record.id, name: input.name, scope: input.scope });
        return created;
      }),

    update: userProcedure
      .input(z.object({ id: z.string(), note: z.string().max(MAX_NOTE) }))
      .mutation(({ input }) => withNotFound(() => tokens.update(input.id, { note: input.note }))),

    /** A new secret; the old one keeps working for `graceMinutes`, 0 for none. */
    rotate: userProcedure
      .input(z.object({ id: z.string(), graceMinutes: z.number().int().min(0).max(7 * 24 * 60).optional() }))
      .mutation(async ({ input, ctx }) => {
        const grace = input.graceMinutes === undefined ? undefined : input.graceMinutes * MINUTE_MS;
        const rotated = await withNotFound(() => tokens.rotate(input.id, grace));
        await recordByUser(ctx.user.sub, "tokens.rotate", { id: input.id, graceMinutes: input.graceMinutes });
        return rotated;
      }),

    revoke: userProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      await withNotFound(() => tokens.revoke(input.id));
      await recordByUser(ctx.user.sub, "tokens.revoke", { id: input.id });
      return { success: true };
    }),

    activity: userProcedure
      .input(
        z.object({
          limit: z.number().int().min(1).max(MAX_ACTIVITY).default(50),
          tokenId: z.string().optional(),
          outcomes: z.array(outcomeSchema).optional(),
          days: z.number().int().min(1).max(MAX_DAYS).optional(),
        }),
      )
      .query(({ input }) => audit.query(input)),

    /** How many entries of each outcome in the window, for filter chips. */
    activityCounts: userProcedure
      .input(z.object({ tokenId: z.string().optional(), days: z.number().int().min(1).max(MAX_DAYS).optional() }))
      .query(async ({ input }) => countOutcomes(await audit.query(input))),

    /** This week against last week, for a one-line summary. */
    digest: userProcedure.query(async () => digest(await audit.readAll(), Date.now())),

    /** The current audit file as text, for download. */
    exportActivity: userProcedure.query(() => audit.exportText()),
  });
}

async function withNotFound<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    throw new TRPCError({ code: "NOT_FOUND", message: err instanceof Error ? err.message : String(err) });
  }
}
