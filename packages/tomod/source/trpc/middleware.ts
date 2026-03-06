import { initTRPC, TRPCError } from "@trpc/server";
import type { Request, Response } from "express";
import type { User, TokenPayload } from "../user.js";
import { AUTH_COOKIE_NAME } from "../config.js";

export interface Context {
  user: TokenPayload | null;
  isSecure: boolean;
  res: Response;
}

export function createContext(
  userService: User,
): (opts: { req: Request; res: Response }) => Context {
  return ({ req, res }: { req: Request; res: Response }) => {
    const token = extractToken(req);
    if (!token) {
      return { user: null, isSecure: req.protocol === "https", res };
    }

    try {
      const payload = userService.validateToken(token);
      return { user: payload, isSecure: req.protocol === "https", res };
    } catch {
      return { user: null, isSecure: req.protocol === "https", res };
    }
  };
}

function extractToken(req: Request): string | null {
  const cookie = (req as unknown as Record<string, unknown>).cookies as
    | Record<string, string>
    | undefined;
  if (cookie?.[AUTH_COOKIE_NAME]) {
    return cookie[AUTH_COOKIE_NAME];
  }

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  return null;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const privateProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
