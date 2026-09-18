import { describe, it, expect } from "vitest";
import { Confirmations } from "./confirmations.js";

describe("Confirmations", () => {
  const start = Date.parse("2026-09-18T12:00:00Z");

  it("issues an id the same token can redeem once", () => {
    const now = start;
    const c = new Confirmations(() => now);
    const pending = c.create({ tokenId: "t1", tool: "apps.install", args: { appId: "immich" }, summary: "Install Immich" });
    expect(pending.id).toMatch(/^[a-f0-9]{16}$/);
    expect(c.listFor("t1")).toEqual([pending]);

    expect(c.take(pending.id, "t1")).toEqual(pending);
    expect(c.take(pending.id, "t1")).toBeUndefined();
    expect(c.listFor("t1")).toEqual([]);
  });

  it("refuses another token's confirmation and expired ones", () => {
    let now = start;
    const c = new Confirmations(() => now);
    const pending = c.create({ tokenId: "t1", tool: "apps.install", args: {}, summary: "x" });
    expect(c.take(pending.id, "t2")).toBeUndefined();

    now += 6 * 60_000;
    expect(c.take(pending.id, "t1")).toBeUndefined();
    expect(c.listFor("t1")).toEqual([]);
  });
});
