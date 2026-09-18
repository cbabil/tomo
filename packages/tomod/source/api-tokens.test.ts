import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ApiTokens, parseToken } from "./api-tokens.js";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("parseToken", () => {
  it("splits a well-formed token and rejects anything else", () => {
    expect(parseToken("tomo_abc123_" + "f".repeat(64))).toEqual({ id: "abc123", secret: "f".repeat(64) });
    expect(parseToken("tomo_abc123")).toBeUndefined();
    expect(parseToken("eyJhbGciOi...")).toBeUndefined();
    expect(parseToken("")).toBeUndefined();
  });
});

describe("ApiTokens", () => {
  let dir: string;
  let tokens: ApiTokens;
  let now: number;
  const clock = () => now;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "tomo-tokens-"));
    now = Date.parse("2026-09-18T12:00:00Z");
    tokens = new ApiTokens(path.join(dir, "api-tokens.json"), clock);
    await tokens.load();
  });
  afterEach(async () => {
    await tokens.flush();
    await rm(dir, { recursive: true, force: true });
  });

  it("creates a token that verifies, and never stores the secret", async () => {
    const { token, record } = await tokens.create({ name: "claude-code", scope: "manage", expiresInDays: 90 });
    expect(token).toMatch(/^tomo_[a-z0-9]{6}_[a-f0-9]{64}$/);
    expect(record).toMatchObject({ name: "claude-code", scope: "manage" });
    expect(record.expiresAt).toBe(new Date(now + 90 * DAY_MS).toISOString());

    const file = await readFile(path.join(dir, "api-tokens.json"), "utf-8");
    expect(file).not.toContain(parseToken(token)!.secret);
    expect((await stat(path.join(dir, "api-tokens.json"))).mode & 0o777).toBe(0o600);

    expect(tokens.verify(token)).toMatchObject({ id: record.id, scope: "manage" });
    expect(tokens.verify(token.slice(0, -1) + "0")).toBeUndefined();
  });

  it("records last use, and refuses expired or revoked tokens", async () => {
    const { token, record } = await tokens.create({ name: "t", scope: "admin", expiresInDays: 1 });
    now += 60_000;
    tokens.verify(token);
    expect(tokens.list()[0].lastUsedAt).toBe(new Date(now).toISOString());

    now += DAY_MS;
    expect(tokens.verify(token)).toBeUndefined();

    now -= DAY_MS;
    await tokens.revoke(record.id);
    expect(tokens.verify(token)).toBeUndefined();
    expect(tokens.list()[0].revokedAt).toBeDefined();
  });

  it("supports a token that never expires", async () => {
    const { token, record } = await tokens.create({ name: "t", scope: "manage", expiresInDays: null });
    expect(record.expiresAt).toBeUndefined();
    now += 400 * DAY_MS;
    expect(tokens.verify(token)).toBeDefined();
  });

  it("rotates with a grace period for the old secret", async () => {
    const first = await tokens.create({ name: "t", scope: "manage", expiresInDays: 90 });
    const second = await tokens.rotate(first.record.id);
    expect(second.record.id).toBe(first.record.id);
    expect(second.token).not.toBe(first.token);

    expect(tokens.verify(second.token)).toBeDefined();
    expect(tokens.verify(first.token)).toBeDefined();
    now += 16 * 60_000;
    expect(tokens.verify(first.token)).toBeUndefined();
    expect(tokens.verify(second.token)).toBeDefined();
  });

  it("rotating again ends the previous grace at once", async () => {
    const first = await tokens.create({ name: "t", scope: "manage", expiresInDays: 90 });
    const second = await tokens.rotate(first.record.id);
    await tokens.rotate(first.record.id);
    expect(tokens.verify(first.token)).toBeUndefined();
    expect(tokens.verify(second.token)).toBeDefined();
  });

  it("persists across a reload and hides hashes from the listing", async () => {
    const { token } = await tokens.create({ name: "t", scope: "manage", expiresInDays: 90 });
    const reloaded = new ApiTokens(path.join(dir, "api-tokens.json"), clock);
    await reloaded.load();
    expect(reloaded.verify(token)).toBeDefined();
    expect(Object.keys(reloaded.list()[0])).not.toContain("hash");
    await reloaded.flush();
  });

  it("pauses an address after repeated failures, for longer each time", () => {
    const bad = "tomo_nope00_" + "0".repeat(64);
    for (let i = 0; i < 10; i++) expect(tokens.verify(bad, "10.0.0.9")).toBeUndefined();
    expect(tokens.isPaused("10.0.0.9")).toBe(true);
    expect(tokens.isPaused("10.0.0.8")).toBe(false);
    now += 61_000;
    expect(tokens.isPaused("10.0.0.9")).toBe(false);

    for (let i = 0; i < 10; i++) tokens.verify(bad, "10.0.0.9");
    now += 61_000;
    expect(tokens.isPaused("10.0.0.9")).toBe(true);
    now += 61_000;
    expect(tokens.isPaused("10.0.0.9")).toBe(false);
  });

  it("pauses a token id that is guessed from many addresses", async () => {
    const { token, record } = await tokens.create({ name: "t", scope: "manage", expiresInDays: 90 });
    const wrong = `tomo_${record.id}_` + "0".repeat(64);
    for (let i = 0; i < 10; i++) expect(tokens.verify(wrong, `10.0.0.${i}`)).toBeUndefined();
    expect(tokens.verify(token, "10.0.0.99")).toBeUndefined();
    now += 61_000;
    expect(tokens.verify(token, "10.0.0.99")).toBeDefined();
  });
});
