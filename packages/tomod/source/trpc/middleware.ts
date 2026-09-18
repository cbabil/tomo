import { initTRPC, TRPCError } from "@trpc/server";
import type { Request, Response } from "express";
import type { User, TokenPayload } from "../user.js";
import type { ApiTokens } from "../api-tokens.js";
import type { AuditLog } from "../audit-log.js";
import { parseToken } from "../api-tokens.js";
import { scopeDenial, isPrivateAddress, type Principal, type RequiredScope } from "../principal.js";
import { AUTH_COOKIE_NAME } from "../config.js";

export interface Context {
  /** Who is calling: a signed-in person or an API token. */
  principal: Principal | null;
  /** The signed-in person's session, when the principal is a user. */
  user: TokenPayload | null;
  isSecure: boolean;
  res: Response;
  audit: AuditLog;
}

export interface AuthServices {
  user: User;
  tokens: ApiTokens;
  audit: AuditLog;
}

/**
 * Resolve the caller. A session cookie or a bearer JWT identifies a person.
 * A bearer `tomo_…` token identifies an API token, accepted from the local
 * network only. Both the forwarded client address (set by Traefik) and the
 * real TCP peer must be private, so a forwarded header on a direct
 * connection cannot fake a local origin.
 */
export function resolvePrincipal(
  req: Request,
  services: Pick<AuthServices, "user" | "tokens">,
): { principal: Principal | null; user: TokenPayload | null } {
  const raw = extractToken(req);
  if (!raw) return { principal: null, user: null };

  if (parseToken(raw)) {
    const client = req.ip ?? "";
    const peer = req.socket.remoteAddress ?? "";
    const principal =
      isPrivateAddress(client) && isPrivateAddress(peer)
        ? services.tokens.verify(raw, client)
        : undefined;
    return { principal: principal ?? null, user: null };
  }

  try {
    const payload = services.user.validateToken(raw);
    return { principal: { kind: "user", name: payload.sub }, user: payload };
  } catch {
    return { principal: null, user: null };
  }
}

export function createContext(
  services: AuthServices,
): (opts: { req: Request; res: Response }) => Context {
  return ({ req, res }: { req: Request; res: Response }) => ({
    ...resolvePrincipal(req, services),
    isSecure: req.protocol === "https",
    res,
    audit: services.audit,
  });
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
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

/**
 * A procedure that needs `required` scope. People have every scope. Token
 * calls are written to the audit log whether they were allowed or not.
 */
export function scoped(required: RequiredScope) {
  return t.procedure.use(async ({ ctx, path, getRawInput, next }) => {
    const { principal } = ctx;
    if (!principal) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }
    if (principal.kind === "user") return next({ ctx: { ...ctx, principal } });

    const audit = async (outcome: "ok" | "denied" | "error", reason?: string) =>
      ctx.audit.record({
        principal: { kind: "token", id: principal.id, name: principal.name },
        action: path,
        args: await getRawInput(),
        outcome,
        reason,
      });

    const reason = scopeDenial(principal, required);
    if (reason) {
      await audit("denied", reason);
      throw new TRPCError({ code: "FORBIDDEN", message: reason });
    }
    const result = await next({ ctx: { ...ctx, principal } });
    await audit(result.ok ? "ok" : "error", result.ok ? undefined : String(result.error.message));
    return result;
  });
}

/** Any signed-in person or token. Used where every caller may read. */
export const privateProcedure = scoped("manage");

/** A signed-in person only: account, tokens, and Tomo itself. */
export const userProcedure = scoped("user").use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only a signed-in person can do this" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
