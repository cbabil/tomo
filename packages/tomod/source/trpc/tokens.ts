import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, userProcedure } from "./middleware.js";
import { TOKEN_SCOPES, type ApiTokens } from "../api-tokens.js";
import type { AuditLog } from "../audit-log.js";

const MAX_TOKEN_NAME = 64;
const MAX_ACTIVITY = 200;
/** null means the token never expires. */
const expirySchema = z.number().int().min(1).max(3650).nullable();

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
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const created = await tokens.create(input);
        await recordByUser(ctx.user.sub, "tokens.create", { id: created.record.id, name: input.name, scope: input.scope });
        return created;
      }),

    rotate: userProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const rotated = await withNotFound(() => tokens.rotate(input.id));
        await recordByUser(ctx.user.sub, "tokens.rotate", { id: input.id });
        return rotated;
      }),

    revoke: userProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await withNotFound(() => tokens.revoke(input.id));
        await recordByUser(ctx.user.sub, "tokens.revoke", { id: input.id });
        return { success: true };
      }),

    activity: userProcedure
      .input(z.object({ limit: z.number().int().min(1).max(MAX_ACTIVITY).default(50) }))
      .query(({ input }) => audit.list(input.limit)),
  });
}

async function withNotFound<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    throw new TRPCError({ code: "NOT_FOUND", message: err instanceof Error ? err.message : String(err) });
  }
}
