/**
 * Pauses callers that keep failing token checks. Failures are counted per
 * key (an address, or a token id) and never reset, so each new batch of
 * failures pauses for longer than the last.
 */
const FAILURES_BEFORE_PAUSE = 10;
const PAUSE_MS = 60 * 1000;
/** Each further batch of failures lengthens the pause, up to this many times. */
const MAX_PAUSE_MULTIPLIER = 16;

export class TokenLockout {
  private readonly failures = new Map<string, { count: number; pausedUntil: number }>();

  constructor(private readonly now: () => number) {}

  isPaused(key: string): boolean {
    const entry = this.failures.get(key);
    return entry !== undefined && entry.pausedUntil > this.now();
  }

  noteFailure(key: string): void {
    const entry = this.failures.get(key) ?? { count: 0, pausedUntil: 0 };
    const count = entry.count + 1;
    const batches = Math.floor(count / FAILURES_BEFORE_PAUSE);
    const pausedUntil =
      count % FAILURES_BEFORE_PAUSE === 0
        ? this.now() + PAUSE_MS * Math.min(batches, MAX_PAUSE_MULTIPLIER)
        : entry.pausedUntil;
    this.failures.set(key, { count, pausedUntil });
  }

  clear(key: string): void {
    this.failures.delete(key);
  }
}
