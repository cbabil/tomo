import { describe, it, expect } from "vitest";
import { tokenStatus } from "./tokenStatus";

const now = Date.parse("2026-09-18T12:00:00Z");
const day = 24 * 60 * 60 * 1000;
const at = (offsetDays: number) => new Date(now + offsetDays * day).toISOString();

describe("tokenStatus", () => {
  it("is revoked before anything else", () => {
    expect(tokenStatus({ revokedAt: at(-1), expiresAt: at(-2) }, now)).toBe("revoked");
  });

  it("is expired once the expiry has passed", () => {
    expect(tokenStatus({ expiresAt: at(-1) }, now)).toBe("expired");
    expect(tokenStatus({ expiresAt: at(0) }, now)).toBe("expired");
  });

  it("warns in the last two weeks before expiry", () => {
    expect(tokenStatus({ expiresAt: at(13) }, now)).toBe("expiring");
    expect(tokenStatus({ expiresAt: at(15) }, now)).toBe("active");
  });

  it("is active without an expiry", () => {
    expect(tokenStatus({}, now)).toBe("active");
  });
});
