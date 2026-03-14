import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  router,
  publicProcedure,
  privateProcedure,
  type Context,
} from "./middleware.js";
import { AUTH_COOKIE_NAME, SESSION_DURATION_DAYS } from "../config.js";
import { createLogger } from "../logger.js";
import type { User } from "../user.js";

const log = createLogger("trpc-user");

const COOKIE_MAX_AGE_MS = SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;

const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(200)
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[0-9]/, "Password must contain a number");

function throwTRPCError(
  err: unknown,
  code: "BAD_REQUEST" | "INTERNAL_SERVER_ERROR" | "UNAUTHORIZED" = "BAD_REQUEST",
): never {
  const message = err instanceof Error ? err.message : String(err);
  log.error("tRPC user error", { code, message });
  throw new TRPCError({
    code,
    message,
  });
}

const BASE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "strict" as const,
  path: "/",
};

function setAuthCookie(ctx: Context, token: string): void {
  ctx.res.cookie(AUTH_COOKIE_NAME, token, {
    ...BASE_COOKIE_OPTIONS,
    secure: ctx.isSecure,
    maxAge: COOKIE_MAX_AGE_MS,
  });
}

export function createUserRouter(userService: User) {
  return router({
    hasUser: publicProcedure.query(() => {
      return userService.hasUser();
    }),

    checkUsername: publicProcedure
      .input(z.object({ name: z.string().min(1).max(32) }))
      .query(async ({ input }) => {
        const taken = await userService.isUsernameTaken(input.name);
        return { available: !taken };
      }),

    register: publicProcedure
      .input(
        z.object({
          name: z
            .string()
            .min(1)
            .max(32)
            .regex(
              /^[a-z_][a-z0-9_-]*$/,
              "Username must be a valid Linux username (lowercase, no spaces)",
            ),
          password: passwordSchema,
        }),
      )
      .mutation(async ({ input, ctx }) => {
        try {
          await userService.register(input.name, input.password);
        } catch (err) {
          throwTRPCError(err);
        }
        try {
          const token = userService.issueToken();
          setAuthCookie(ctx, token);
        } catch (err) {
          log.warn("Auto-login after registration failed", {
            error: String(err),
          });
        }
        return { success: true };
      }),

    login: publicProcedure
      .input(z.object({ password: z.string() }))
      .mutation(async ({ input, ctx }) => {
        try {
          const token = await userService.login(input.password);
          setAuthCookie(ctx, token);
          return { success: true };
        } catch (err) {
          throwTRPCError(err, "UNAUTHORIZED");
        }
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(AUTH_COOKIE_NAME, BASE_COOKIE_OPTIONS);
      return { success: true };
    }),

    changePassword: privateProcedure
      .input(
        z.object({
          oldPassword: z.string(),
          newPassword: passwordSchema,
        }),
      )
      .mutation(async ({ input }) => {
        try {
          await userService.changePassword(
            input.oldPassword,
            input.newPassword,
          );
          return { success: true };
        } catch (err) {
          throwTRPCError(err);
        }
      }),

    me: privateProcedure.query(({ ctx }) => {
      return {
        name: ctx.user.sub,
      };
    }),
  });
}
