export type TokenStatus = "active" | "expiring" | "expired" | "revoked";

const EXPIRY_WARNING_MS = 14 * 24 * 60 * 60 * 1000;

/** The state of an API token as the owner should see it. */
export function tokenStatus(
  token: { expiresAt?: string; revokedAt?: string },
  now: number = Date.now(),
): TokenStatus {
  if (token.revokedAt) return "revoked";
  if (token.expiresAt === undefined) return "active";
  const remaining = Date.parse(token.expiresAt) - now;
  if (remaining <= 0) return "expired";
  return remaining <= EXPIRY_WARNING_MS ? "expiring" : "active";
}
