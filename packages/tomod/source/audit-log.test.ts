import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { AuditLog, redact } from "./audit-log.js";

describe("redact", () => {
  it("masks values under secret-looking keys and secret-looking strings", () => {
    expect(
      redact({
        appId: "litellm",
        password: "hunter2",
        env: { API_KEY: "abc", nested: { token: "t" } },
        note: "bearer tomo_abc123_" + "f".repeat(64),
        jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.abcdefghijklmnopqrstuvwxyz0123456789",
      }),
    ).toEqual({
      appId: "litellm",
      password: "[redacted]",
      env: { API_KEY: "[redacted]", nested: { token: "[redacted]" } },
      note: "bearer [redacted]",
      jwt: "[redacted]",
    });
  });

  it("leaves ordinary values alone", () => {
    expect(redact({ name: "Gitea", port: 3000, list: ["a", 1, null] })).toEqual({
      name: "Gitea",
      port: 3000,
      list: ["a", 1, null],
    });
  });
});

describe("AuditLog", () => {
  let dir: string;
  let audit: AuditLog;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "tomo-audit-"));
    audit = new AuditLog(path.join(dir, "audit.jsonl"), () => Date.parse("2026-09-18T12:00:00Z"));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("appends redacted entries and lists the newest first", async () => {
    await audit.record({
      principal: { kind: "token", id: "abc123", name: "claude" },
      action: "apps.start",
      args: { appId: "gitea", password: "x" },
      outcome: "ok",
    });
    await audit.record({
      principal: { kind: "token", id: "abc123", name: "claude" },
      action: "apps.uninstall",
      args: { appId: "gitea" },
      outcome: "denied",
      reason: "scope admin required",
    });

    const raw = await readFile(path.join(dir, "audit.jsonl"), "utf-8");
    expect(raw.trim().split("\n")).toHaveLength(2);
    expect(raw).not.toContain('"x"');

    const entries = await audit.list(10);
    expect(entries.map((e) => e.action)).toEqual(["apps.uninstall", "apps.start"]);
    expect(entries[0]).toMatchObject({ outcome: "denied", reason: "scope admin required", time: "2026-09-18T12:00:00.000Z" });
  });

  it("returns an empty list before anything was recorded", async () => {
    expect(await audit.list(10)).toEqual([]);
  });
});
