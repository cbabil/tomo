export type TokenStatus = "active" | "expiring" | "expired" | "revoked" | "idle";

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_WARNING_MS = 14 * DAY_MS;
/** A live token nobody has used for this long is worth a second look. */
export const IDLE_AFTER_DAYS = 60;

interface TokenTimes {
  createdAt?: string;
  lastUsedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
}

/** The state of an API token as the owner should see it. */
export function tokenStatus(token: TokenTimes, now: number = Date.now()): TokenStatus {
  if (token.revokedAt) return "revoked";
  if (token.expiresAt !== undefined) {
    const remaining = Date.parse(token.expiresAt) - now;
    if (remaining <= 0) return "expired";
    if (remaining <= EXPIRY_WARNING_MS) return "expiring";
  }
  return idleDays(token, now) >= IDLE_AFTER_DAYS ? "idle" : "active";
}

/** Whole days since the token was last used, or since it was created if never. */
export function idleDays(token: TokenTimes, now: number = Date.now()): number {
  const since = token.lastUsedAt ?? token.createdAt;
  return since ? Math.floor((now - Date.parse(since)) / DAY_MS) : 0;
}
