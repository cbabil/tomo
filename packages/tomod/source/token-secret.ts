/**
 * Secret material for API tokens: the `tomo_<id>_<secret>` wire format,
 * scrypt hashing with a per-token salt, and constant-time comparison.
 */
import crypto from "node:crypto";

const SECRET_BYTES = 32;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

export interface HashedSecret {
  salt: string;
  hash: string;
}

export function parseToken(raw: string): { id: string; secret: string } | undefined {
  const match = /^tomo_([a-z0-9]{6})_([a-f0-9]{64})$/.exec(raw);
  return match ? { id: match[1], secret: match[2] } : undefined;
}

function hashSecret(secret: string, salt: string): string {
  return crypto.scryptSync(secret, salt, HASH_BYTES).toString("hex");
}

export function newSecret(): { secret: string; stored: HashedSecret } {
  const secret = crypto.randomBytes(SECRET_BYTES).toString("hex");
  const salt = crypto.randomBytes(SALT_BYTES).toString("hex");
  return { secret, stored: { salt, hash: hashSecret(secret, salt) } };
}

export function matches(secret: string, stored: HashedSecret): boolean {
  const candidate = Buffer.from(hashSecret(secret, stored.salt), "hex");
  const expected = Buffer.from(stored.hash, "hex");
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}
