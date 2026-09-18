/**
 * Who is calling: a signed-in person, or an API token with a scope.
 *
 * Required scopes form a ladder. `manage` is day-to-day operation, `admin`
 * adds removal and security settings, and `user` marks actions only a
 * signed-in person may take, such as managing tokens or the account.
 */
import type { TokenPrincipal, TokenScope } from "./api-tokens.js";

export interface UserPrincipal {
  kind: "user";
  name: string;
}

export type Principal = UserPrincipal | TokenPrincipal;

export type RequiredScope = TokenScope | "user";

const RANK: Record<TokenScope, number> = { manage: 1, admin: 2 };

export function hasScope(principal: Principal | null, required: RequiredScope): boolean {
  if (!principal) return false;
  if (principal.kind === "user") return true;
  if (required === "user") return false;
  return RANK[principal.scope] >= RANK[required];
}

const PRIVATE_V4 = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^127\./, /^169\.254\./];

/** True for addresses on the local network, where tokens are accepted. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.startsWith("::ffff:") ? address.slice(7) : address;
  if (ip === "::1") return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(ip) || /^fe[89ab][0-9a-f]:/i.test(ip)) return true;
  return PRIVATE_V4.some((range) => range.test(ip));
}
