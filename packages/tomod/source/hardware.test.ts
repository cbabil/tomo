import { describe, it, expect } from "vitest";
import { toMemoryUsage } from "./hardware.js";

const MB = 1024 * 1024;

describe("toMemoryUsage", () => {
  it("does not count reclaimable disk cache as used memory", () => {
    // Real figures from a Raspberry Pi 5: 8062 MB total, of which 4920 MB is
    // buffers and cache, leaving 6236 MB available to applications. The
    // kernel's own "used" figure for this machine was 6573 MB, or 82 percent.
    const usage = toMemoryUsage({ total: 8062 * MB, available: 6236 * MB });
    expect(usage.total).toBe(8062 * MB);
    expect(usage.used).toBe(1826 * MB);
    expect(usage.free).toBe(6236 * MB);
    expect(Math.round(usage.percentage)).toBe(23);
  });

  it("reports zero rather than dividing by zero", () => {
    expect(toMemoryUsage({ total: 0, available: 0 }).percentage).toBe(0);
  });
});
