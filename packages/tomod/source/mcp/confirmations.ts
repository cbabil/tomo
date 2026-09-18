/**
 * Pending confirmations: a tool call an agent must restate before it runs.
 * Each is bound to the token that asked, expires after a few minutes, and
 * can be redeemed once.
 */
import crypto from "node:crypto";

const TTL_MS = 5 * 60 * 1000;
const ID_BYTES = 8;

export interface PendingConfirmation {
  id: string;
  tokenId: string;
  tool: string;
  args: Record<string, unknown>;
  /** What will happen, in plain words, for the agent to restate. */
  summary: string;
  expiresAt: string;
}

export class Confirmations {
  private readonly pending = new Map<string, PendingConfirmation>();

  constructor(private readonly now: () => number = Date.now) {}

  create(input: Omit<PendingConfirmation, "id" | "expiresAt">): PendingConfirmation {
    this.prune();
    const entry: PendingConfirmation = {
      ...input,
      id: crypto.randomBytes(ID_BYTES).toString("hex"),
      expiresAt: new Date(this.now() + TTL_MS).toISOString(),
    };
    this.pending.set(entry.id, entry);
    return entry;
  }

  /** Redeem a confirmation for the token that asked; undefined if unknown, expired, or not theirs. */
  take(id: string, tokenId: string): PendingConfirmation | undefined {
    this.prune();
    const entry = this.pending.get(id);
    if (!entry || entry.tokenId !== tokenId) return undefined;
    this.pending.delete(id);
    return entry;
  }

  listFor(tokenId: string): PendingConfirmation[] {
    this.prune();
    return [...this.pending.values()].filter((entry) => entry.tokenId === tokenId);
  }

  private prune(): void {
    const now = this.now();
    for (const [id, entry] of this.pending) {
      if (Date.parse(entry.expiresAt) <= now) this.pending.delete(id);
    }
  }
}
