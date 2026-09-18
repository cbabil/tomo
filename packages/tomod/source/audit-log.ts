/**
 * Append-only record of what API tokens did: one JSON line per call, with
 * secret-looking values masked. Rotated by size so it cannot fill the disk.
 */
import { appendFile, readFile, rename, rm, stat } from "node:fs/promises";
import { createLogger } from "./logger.js";

const log = createLogger("audit");

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const KEPT_ROTATIONS = 3;
const REDACTED = "[redacted]";
const SECRET_KEY = /pass|secret|token|key|auth|credential|cookie/i;
const SECRET_VALUE = /tomo_[a-z0-9]{6}_[a-f0-9]{64}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

export interface AuditPrincipal {
  kind: "user" | "token";
  id?: string;
  name: string;
}

export interface AuditEntry {
  time: string;
  principal: AuditPrincipal;
  action: string;
  args?: unknown;
  outcome: "ok" | "denied" | "error";
  reason?: string;
}

/** Mask anything that looks like a secret, by key name or by value shape. */
export function redact(value: unknown): unknown {
  if (typeof value === "string") return value.replace(SECRET_VALUE, REDACTED);
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, inner]) => [
        key,
        SECRET_KEY.test(key) ? REDACTED : redact(inner),
      ]),
    );
  }
  return value;
}

export class AuditLog {
  constructor(
    private readonly filePath: string,
    private readonly now: () => number = Date.now,
  ) {}

  async record(entry: Omit<AuditEntry, "time">): Promise<void> {
    const line = JSON.stringify({
      time: new Date(this.now()).toISOString(),
      ...entry,
      ...(entry.args !== undefined && { args: redact(entry.args) }),
    });
    try {
      await this.rotateIfLarge();
      await appendFile(this.filePath, line + "\n", { mode: 0o600 });
    } catch (err) {
      log.error("Could not write audit entry", { error: String(err) });
    }
  }

  /** The most recent entries, newest first. */
  async list(limit: number): Promise<AuditEntry[]> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf-8");
    } catch {
      return [];
    }
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .reverse()
      .map((line) => JSON.parse(line) as AuditEntry);
  }

  private async rotateIfLarge(): Promise<void> {
    let size: number;
    try {
      size = (await stat(this.filePath)).size;
    } catch {
      return;
    }
    if (size < MAX_FILE_BYTES) return;
    await rm(`${this.filePath}.${KEPT_ROTATIONS}`, { force: true });
    for (let i = KEPT_ROTATIONS - 1; i >= 1; i--) {
      await rename(`${this.filePath}.${i}`, `${this.filePath}.${i + 1}`).catch(() => {});
    }
    await rename(this.filePath, `${this.filePath}.1`);
  }
}
