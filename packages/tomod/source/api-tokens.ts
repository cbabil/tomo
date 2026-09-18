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
import { createLogger } from "./logger.js";
import { TokenLockout } from "./token-lockout.js";
import { matches, newSecret, parseToken } from "./token-secret.js";
import { FileSchema, MAX_NOTE, toView, type ApiTokenView, type TokenPrincipal, type TokenRecord, type TokenScope } from "./token-record.js";

export { parseToken } from "./token-secret.js";
export { TOKEN_SCOPES } from "./token-record.js";
export type { ApiTokenView, TokenPrincipal, TokenScope } from "./token-record.js";

const log = createLogger("api-tokens");


const ID_LENGTH = 6;
const DAY_MS = 24 * 60 * 60 * 1000;
/** How long the previous secret keeps working after a rotation, unless the owner picks otherwise. */
export const DEFAULT_ROTATION_GRACE_MS = 15 * 60 * 1000;
/** lastUsedAt is a rough indicator; the audit log has exact times. */
const LAST_USED_RESOLUTION_MS = 60 * 1000;

export class ApiTokens {
  private records: TokenRecord[] = [];
  private readonly lockout: TokenLockout;
  /** Writes run one after another so a last-use stamp never races a rotation. */
  private writes: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly now: () => number = Date.now,
  ) {
    this.lockout = new TokenLockout(now);
  }

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

  async update(id: string, input: { note?: string }): Promise<ApiTokenView> {
    const record = this.active(id);
    const updated = { ...record, ...(input.note !== undefined && { note: input.note.slice(0, MAX_NOTE) }) };
    this.records = this.records.map((r) => (r.id === id ? updated : r));
    await this.save();
    return toView(updated);
  }

  /** Issue a new secret for a token; the old one keeps working for the grace window. */
  async rotate(id: string, graceMs = DEFAULT_ROTATION_GRACE_MS): Promise<{ token: string; record: ApiTokenView }> {
    const record = this.active(id);
    const { secret, stored } = newSecret();
    const rotated: TokenRecord = {
      ...record,
      secret: stored,
      rotatedAt: this.iso(),
      previous: graceMs > 0 ? { ...record.secret, graceUntil: new Date(this.now() + graceMs).toISOString() } : undefined,
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
    if (keys.some((key) => this.lockout.isPaused(key))) return undefined;
    const record = parsed && this.records.find((r) => r.id === parsed.id);
    const accepted = parsed && record && !record.revokedAt && !this.expired(record) && this.secretAccepted(record, parsed.secret);
    if (!accepted) {
      keys.forEach((key) => this.lockout.noteFailure(key));
      return undefined;
    }
    keys.forEach((key) => this.lockout.clear(key));
    this.stampLastUsed(record, accepted === "previous");
    return { kind: "token", id: record.id, name: record.name, scope: record.scope };
  }

  isPaused(address: string): boolean {
    return this.lockout.isPaused(address);
  }

  /** Which secret matched, if any: the current one, or the previous one still in its grace window. */
  private secretAccepted(record: TokenRecord, secret: string): "current" | "previous" | undefined {
    if (matches(secret, record.secret)) return "current";
    const previous = record.previous;
    if (previous !== undefined && Date.parse(previous.graceUntil) > this.now() && matches(secret, previous)) return "previous";
    return undefined;
  }

  private expired(record: TokenRecord): boolean {
    return record.expiresAt !== undefined && Date.parse(record.expiresAt) <= this.now();
  }

  /** Rewrite the file at most once a minute per token, not on every call. */
  private stampLastUsed(record: TokenRecord, viaPrevious: boolean): void {
    const holder = viaPrevious && record.previous ? record.previous : record;
    const last = holder.lastUsedAt ? Date.parse(holder.lastUsedAt) : 0;
    if (this.now() - last < LAST_USED_RESOLUTION_MS) return;
    holder.lastUsedAt = this.iso();
    void this.save();
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
