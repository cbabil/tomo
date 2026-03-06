import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, privateProcedure } from "./middleware.js";
import { AUTH_COOKIE_NAME } from "../config.js";
import { createLogger } from "../logger.js";
import type { User } from "../user.js";

const log = createLogger("trpc-user");

const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(200)
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[0-9]/, "Password must contain a number");

function throwTRPCError(
  err: unknown,
  code: "BAD_REQUEST" | "INTERNAL_SERVER_ERROR" = "BAD_REQUEST",
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

export function createUserRouter(userService: User) {
  return router({
    hasUser: publicProcedure.query(() => {
      return userService.hasUser();
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
      .mutation(async ({ input }) => {
        try {
          await userService.register(input.name, input.password);
          return { success: true };
        } catch (err) {
          throwTRPCError(err);
        }
      }),

    login: publicProcedure
      .input(z.object({ password: z.string() }))
      .mutation(async ({ input, ctx }) => {
        try {
          const token = await userService.login(input.password);
          ctx.res.cookie(AUTH_COOKIE_NAME, token, {
            ...BASE_COOKIE_OPTIONS,
            secure: ctx.isSecure,
            maxAge: 7 * 24 * 60 * 60 * 1000,
          });
          return { success: true };
        } catch (err) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: err instanceof Error ? err.message : String(err),
          });
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
