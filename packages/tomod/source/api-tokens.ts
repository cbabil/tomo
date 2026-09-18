/**
 * API tokens let agents and scripts use Tomo without a browser session.
 *
 * A token is `tomo_<id>_<secret>`. Only the id and an scrypt hash of the
 * secret are stored, so a leaked file cannot be replayed. Tokens carry a
 * scope, expire by default, can be rotated with a grace period, and can be
 * revoked at once.
 */
import { readOptionalFile, writeFileAtomic } from "./fs-utils.js";
import crypto from "node:crypto";
import { z } from "zod";
import { createLogger } from "./logger.js";

const log = createLogger("api-tokens");

export const TOKEN_SCOPES = ["manage", "admin"] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

const ID_LENGTH = 6;
const SECRET_BYTES = 32;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const DAY_MS = 24 * 60 * 60 * 1000;
/** How long the previous secret keeps working after a rotation. */
const ROTATION_GRACE_MS = 15 * 60 * 1000;
const FAILURES_BEFORE_PAUSE = 10;
const PAUSE_MS = 60 * 1000;
/** Each further batch of failures lengthens the pause, up to this many times. */
const MAX_PAUSE_MULTIPLIER = 16;
/** lastUsedAt is a rough indicator; the audit log has exact times. */
const LAST_USED_RESOLUTION_MS = 60 * 1000;

const HashedSecretSchema = z.object({ salt: z.string(), hash: z.string() });

const TokenRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  scope: z.enum(TOKEN_SCOPES),
  secret: HashedSecretSchema,
  createdAt: z.string(),
  lastUsedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  revokedAt: z.string().optional(),
  rotatedAt: z.string().optional(),
  /** The secret before the last rotation, honoured until graceUntil. */
  previous: HashedSecretSchema.extend({ graceUntil: z.string() }).optional(),
});
type TokenRecord = z.infer<typeof TokenRecordSchema>;
const FileSchema = z.object({ version: z.literal(1), tokens: z.array(TokenRecordSchema) });

/** A token as shown to the owner: everything but the secret material. */
export type ApiTokenView = Omit<TokenRecord, "secret" | "previous">;

/** The principal a verified token represents. */
export interface TokenPrincipal {
  kind: "token";
  id: string;
  name: string;
  scope: TokenScope;
}

export function parseToken(raw: string): { id: string; secret: string } | undefined {
  const match = /^tomo_([a-z0-9]{6})_([a-f0-9]{64})$/.exec(raw);
  return match ? { id: match[1], secret: match[2] } : undefined;
}

function hashSecret(secret: string, salt: string): string {
  return crypto.scryptSync(secret, salt, HASH_BYTES).toString("hex");
}

function newSecret(): { secret: string; stored: z.infer<typeof HashedSecretSchema> } {
  const secret = crypto.randomBytes(SECRET_BYTES).toString("hex");
  const salt = crypto.randomBytes(SALT_BYTES).toString("hex");
  return { secret, stored: { salt, hash: hashSecret(secret, salt) } };
}

function matches(secret: string, stored: { salt: string; hash: string }): boolean {
  const candidate = Buffer.from(hashSecret(secret, stored.salt), "hex");
  const expected = Buffer.from(stored.hash, "hex");
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function toView(record: TokenRecord): ApiTokenView {
  const { secret: _secret, previous: _previous, ...view } = record;
  return view;
}

export class ApiTokens {
  private records: TokenRecord[] = [];
  private readonly failures = new Map<string, { count: number; pausedUntil: number }>();
  /** Writes run one after another so a last-use stamp never races a rotation. */
  private writes: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly now: () => number = Date.now,
  ) {}

  async load(): Promise<void> {
    const raw = await readOptionalFile(this.filePath, (error) =>
      log.error("Could not read API tokens; starting with none", { error }),
    );
    try {
      this.records = raw === undefined ? [] : FileSchema.parse(JSON.parse(raw)).tokens;
    } catch (err) {
      log.error("API tokens file is not valid; starting with none", { error: String(err) });
      this.records = [];
    }
  }

  list(): ApiTokenView[] {
    return this.records.map(toView);
  }

  /** Create a token. The returned `token` is shown once and never stored. */
  async create(input: {
    name: string;
    scope: TokenScope;
    expiresInDays: number | null;
  }): Promise<{ token: string; record: ApiTokenView }> {
    const id = crypto.randomBytes(ID_LENGTH / 2).toString("hex");
    const { secret, stored } = newSecret();
    const record: TokenRecord = {
      id,
      name: input.name,
      scope: input.scope,
      secret: stored,
      createdAt: this.iso(),
      ...(input.expiresInDays !== null && {
        expiresAt: new Date(this.now() + input.expiresInDays * DAY_MS).toISOString(),
      }),
    };
    this.records = [...this.records, record];
    await this.save();
    log.info("API token created", { id, name: input.name, scope: input.scope });
    return { token: `tomo_${id}_${secret}`, record: toView(record) };
  }

  /** Issue a new secret for a token; the old one keeps working for ROTATION_GRACE_MS. */
  async rotate(id: string): Promise<{ token: string; record: ApiTokenView }> {
    const record = this.active(id);
    const { secret, stored } = newSecret();
    const rotated: TokenRecord = {
      ...record,
      secret: stored,
      rotatedAt: this.iso(),
      previous: { ...record.secret, graceUntil: new Date(this.now() + ROTATION_GRACE_MS).toISOString() },
    };
    this.records = this.records.map((r) => (r.id === id ? rotated : r));
    await this.save();
    log.info("API token rotated", { id });
    return { token: `tomo_${id}_${secret}`, record: toView(rotated) };
  }

  async revoke(id: string): Promise<void> {
    const record = this.active(id);
    this.records = this.records.map((r) =>
      r.id === id ? { ...record, revokedAt: this.iso(), previous: undefined } : r,
    );
    await this.save();
    log.info("API token revoked", { id });
  }

  /**
   * Resolve a raw token to its principal, or undefined when it is unknown,
   * expired, revoked, or the address is paused after repeated failures.
   * A successful check stamps lastUsedAt.
   */
  verify(raw: string, address = ""): TokenPrincipal | undefined {
    const parsed = parseToken(raw);
    // Failures count against the caller's address and against the token id,
    // so guessing one token from many addresses is paused as well.
    const keys = [address, ...(parsed ? [`token:${parsed.id}`] : [])];
    if (keys.some((key) => this.isPaused(key))) return undefined;
    const record = parsed && this.records.find((r) => r.id === parsed.id);
    const accepted =
      parsed && record && !record.revokedAt && !this.expired(record) && this.secretAccepted(record, parsed.secret);
    if (!accepted) {
      keys.forEach((key) => this.noteFailure(key));
      return undefined;
    }
    keys.forEach((key) => this.failures.delete(key));
    this.stampLastUsed(record);
    return { kind: "token", id: record.id, name: record.name, scope: record.scope };
  }

  isPaused(address: string): boolean {
    const entry = this.failures.get(address);
    return entry !== undefined && entry.pausedUntil > this.now();
  }

  private secretAccepted(record: TokenRecord, secret: string): boolean {
    if (matches(secret, record.secret)) return true;
    const previous = record.previous;
    return previous !== undefined && Date.parse(previous.graceUntil) > this.now() && matches(secret, previous);
  }

  private expired(record: TokenRecord): boolean {
    return record.expiresAt !== undefined && Date.parse(record.expiresAt) <= this.now();
  }

  /** Rewrite the file at most once a minute per token, not on every call. */
  private stampLastUsed(record: TokenRecord): void {
    const last = record.lastUsedAt ? Date.parse(record.lastUsedAt) : 0;
    if (this.now() - last < LAST_USED_RESOLUTION_MS) return;
    record.lastUsedAt = this.iso();
    void this.save();
  }

  /** Count failures without ever resetting, so each new batch pauses for longer. */
  private noteFailure(key: string): void {
    const entry = this.failures.get(key) ?? { count: 0, pausedUntil: 0 };
    const count = entry.count + 1;
    const batches = Math.floor(count / FAILURES_BEFORE_PAUSE);
    const pausedUntil =
      count % FAILURES_BEFORE_PAUSE === 0
        ? this.now() + PAUSE_MS * Math.min(batches, MAX_PAUSE_MULTIPLIER)
        : entry.pausedUntil;
    this.failures.set(key, { count, pausedUntil });
  }

  private active(id: string): TokenRecord {
    const record = this.records.find((r) => r.id === id);
    if (!record || record.revokedAt) throw new Error(`Token not found: ${id}`);
    return record;
  }

  private iso(): string {
    return new Date(this.now()).toISOString();
  }

  /** Wait for queued writes, so a shutdown never loses a last-use stamp. */
  flush(): Promise<void> {
    return this.writes;
  }

  /** Write after any write already queued, so writes never interleave. */
  private save(): Promise<void> {
    const body = JSON.stringify({ version: 1, tokens: this.records }, null, 2);
    const write = () => writeFileAtomic(this.filePath, body);
    this.writes = this.writes.then(write, write);
    return this.writes;
  }
}
