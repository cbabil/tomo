/**
 * Pending confirmations: a change an agent asked for that does not run yet.
 * Either the agent must restate it and call tomo.confirm, or a person must
 * first approve it on the Tomo desktop. Each is bound to the token that
 * asked, expires unanswered after ten minutes, and is redeemed once.
 */
import crypto from "node:crypto";
import { createLogger } from "../logger.js";

const log = createLogger("confirmations");

const TTL_MS = 10 * 60 * 1000;
const ID_BYTES = 8;

export interface PendingConfirmation {
  id: string;
  tokenId: string;
  tokenName: string;
  tool: string;
  args: Record<string, unknown>;
  /** What will happen, in plain words, for the agent or a person to read. */
  summary: string;
  /** True when a person must approve it on the desktop before it can run. */
  needsPerson: boolean;
  createdAt: string;
  expiresAt: string;
  decision?: { approved: boolean; by: string; at: string };
}

export type ConfirmationStatus = "unknown" | "awaiting_person" | "ready" | "denied";

type NewConfirmation = Omit<PendingConfirmation, "id" | "createdAt" | "expiresAt" | "decision">;

export class Confirmations {
  private readonly entries = new Map<string, PendingConfirmation>();

  constructor(private readonly now: () => number = Date.now) {}

  create(input: NewConfirmation): PendingConfirmation {
    this.prune();
    const entry: PendingConfirmation = {
      ...input,
      id: crypto.randomBytes(ID_BYTES).toString("hex"),
      createdAt: new Date(this.now()).toISOString(),
      expiresAt: new Date(this.now() + TTL_MS).toISOString(),
    };
    this.entries.set(entry.id, entry);
    if (entry.needsPerson) log.info("Approval requested", { id: entry.id, tool: entry.tool, token: entry.tokenId });
    return entry;
  }

  /** Where this confirmation stands for the token that asked; unknown if expired, used, or not theirs. */
  status(id: string, tokenId: string): ConfirmationStatus {
    return this.claim(id, tokenId, false).status;
  }

  /** Redeem a ready confirmation for the token that asked, once. */
  take(id: string, tokenId: string): PendingConfirmation | undefined {
    return this.claim(id, tokenId, true).entry;
  }

  /**
   * One lookup that reports the status and, when `redeem` is set and it is
   * ready, removes and returns the entry so it runs exactly once.
   */
  claim(id: string, tokenId: string, redeem = true): { status: ConfirmationStatus; entry?: PendingConfirmation } {
    const entry = this.find(id, tokenId);
    if (!entry) return { status: "unknown" };
    if (entry.decision && !entry.decision.approved) return { status: "denied" };
    if (!entry.decision && entry.needsPerson) return { status: "awaiting_person" };
    if (redeem) this.entries.delete(id);
    return { status: "ready", entry };
  }

  /** What a person decided. Only a signed-in person calls this. */
  decide(id: string, approved: boolean, by: string): PendingConfirmation {
    const entry = this.find(id);
    if (!entry?.needsPerson || entry.decision) throw new Error(`Approval not found or already decided: ${id}`);
    const decided = { ...entry, decision: { approved, by, at: new Date(this.now()).toISOString() } };
    this.entries.set(id, decided);
    log.info("Approval decided", { id, approved, by });
    return decided;
  }

  /** Requests still waiting for a person, for the desktop to show. */
  awaitingPerson(): PendingConfirmation[] {
    this.prune();
    return [...this.entries.values()].filter((e) => e.needsPerson && !e.decision);
  }

  listFor(tokenId: string): PendingConfirmation[] {
    this.prune();
    return [...this.entries.values()].filter((e) => e.tokenId === tokenId);
  }

  private find(id: string, tokenId?: string): PendingConfirmation | undefined {
    this.prune();
    const entry = this.entries.get(id);
    if (!entry || (tokenId !== undefined && entry.tokenId !== tokenId)) return undefined;
    return entry;
  }

  private prune(): void {
    const now = this.now();
    for (const [id, entry] of this.entries) {
      if (Date.parse(entry.expiresAt) <= now) this.entries.delete(id);
    }
  }
}
