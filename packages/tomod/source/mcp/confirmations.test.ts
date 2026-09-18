import { describe, it, expect } from "vitest";
import { Confirmations } from "./confirmations.js";

const start = Date.parse("2026-09-18T12:00:00Z");
const ask = { tokenId: "t1", tokenName: "claude", tool: "apps.install", args: { appId: "immich" }, summary: "Install Immich" };

describe("Confirmations for the agent", () => {
  it("issues an id the same token can redeem once", () => {
    const c = new Confirmations(() => start);
    const pending = c.create({ ...ask, needsPerson: false });
    expect(pending.id).toMatch(/^[a-f0-9]{16}$/);
    expect(c.status(pending.id, "t1")).toBe("ready");
    expect(c.listFor("t1")).toEqual([pending]);
    expect(c.awaitingPerson()).toEqual([]);

    expect(c.take(pending.id, "t1")).toEqual(pending);
    expect(c.take(pending.id, "t1")).toBeUndefined();
    expect(c.status(pending.id, "t1")).toBe("unknown");
  });

  it("refuses another token's confirmation and expired ones", () => {
    let now = start;
    const c = new Confirmations(() => now);
    const pending = c.create({ ...ask, needsPerson: false });
    expect(c.take(pending.id, "t2")).toBeUndefined();

    now += 11 * 60_000;
    expect(c.take(pending.id, "t1")).toBeUndefined();
    expect(c.listFor("t1")).toEqual([]);
  });
});

describe("Confirmations for a person", () => {
  it("waits for a decision, then lets the asking token redeem once", () => {
    const c = new Confirmations(() => start);
    const req = c.create({ ...ask, tool: "apps.remove", needsPerson: true });
    expect(c.status(req.id, "t1")).toBe("awaiting_person");
    expect(c.take(req.id, "t1")).toBeUndefined();
    expect(c.awaitingPerson()).toEqual([req]);

    c.decide(req.id, true, "admin");
    expect(c.status(req.id, "t1")).toBe("ready");
    expect(c.awaitingPerson()).toEqual([]);
    expect(c.take(req.id, "t1")).toEqual(expect.objectContaining({ tool: "apps.remove" }));
    expect(c.take(req.id, "t1")).toBeUndefined();
  });

  it("reports a denial, hides other tokens' requests, and decides only once", () => {
    const c = new Confirmations(() => start);
    const req = c.create({ ...ask, needsPerson: true });
    c.decide(req.id, false, "admin");
    expect(c.status(req.id, "t1")).toBe("denied");
    expect(c.take(req.id, "t1")).toBeUndefined();
    expect(c.status(req.id, "t2")).toBe("unknown");
    expect(() => c.decide(req.id, true, "admin")).toThrow(/already decided/);
  });

  it("cannot decide a plain agent confirmation, and expires unanswered requests", () => {
    let now = start;
    const c = new Confirmations(() => now);
    const plain = c.create({ ...ask, needsPerson: false });
    expect(() => c.decide(plain.id, true, "admin")).toThrow(/not found/i);

    const req = c.create({ ...ask, needsPerson: true });
    now += 11 * 60_000;
    expect(c.status(req.id, "t1")).toBe("unknown");
    expect(c.awaitingPerson()).toEqual([]);
    expect(() => c.decide(req.id, true, "admin")).toThrow(/not found/i);
  });
});
