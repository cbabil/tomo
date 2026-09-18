import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createCallerFactory, type Context } from "./middleware.js";
import { createGuardrailsRouter } from "./guardrails.js";
import { PolicyStore } from "../mcp/policies.js";
import { Confirmations } from "../mcp/confirmations.js";
import { AuditLog } from "../audit-log.js";

const buildCaller = (policies: PolicyStore, confirmations: Confirmations, audit: AuditLog, ctx: Context) =>
  createCallerFactory(createGuardrailsRouter(policies, confirmations, audit))(ctx);

describe("guardrails router", () => {
  let dir: string;
  let policies: PolicyStore;
  let confirmations: Confirmations;
  let audit: AuditLog;
  let caller: ReturnType<typeof buildCaller>;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "tomo-guardrails-router-"));
    policies = new PolicyStore(dir);
    await policies.load();
    confirmations = new Confirmations();
    audit = new AuditLog(path.join(dir, "audit.jsonl"));
    const ctx = {
      principal: { kind: "user", name: "pi" },
      user: { sub: "pi" },
      isSecure: false,
      res: {},
      audit,
    } as unknown as Context;
    caller = buildCaller(policies, confirmations, audit, ctx);
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("saves structured rules, lists tools, and tries a request at a chosen time", async () => {
    await caller.saveRules({
      rules: [{ name: "night", match: { tools: ["apps.restart"] }, when: { hours: "22:00-07:00" }, effect: "deny", message: "No" }],
    });
    expect((await caller.get()).rules).toHaveLength(1);
    expect((await caller.tools()).map((t) => t.name)).toContain("apps.restart");
    expect(await caller.try({ tool: "apps.restart", at: "2026-09-18T23:30:00" })).toMatchObject({ effect: "deny", rule: "night" });
    expect(await caller.try({ tool: "apps.restart", at: "2026-09-18T12:00:00" })).toEqual({ effect: "allow" });
  });

  it("remembers a decision as a rule, except for built-in rules", async () => {
    const ask = { tokenId: "t", tokenName: "claude", tool: "apps.install", args: { appId: "immich" }, summary: "x", needsPerson: true };
    const owned = confirmations.create({ ...ask, rule: "ask-installs" });
    await caller.decide({ id: owned.id, approved: true, remember: "allow" });
    expect(policies.ownerRules()[0]).toMatchObject({ name: "allow-apps-install-immich", effect: "allow", match: { apps: ["immich"] } });

    const floor = confirmations.create({ ...ask, tool: "apps.remove", rule: "removal-needs-a-person" });
    await expect(caller.decide({ id: floor.id, approved: true, remember: "allow" })).rejects.toThrow(/built-in/);
  });

  it("masks secrets in the arguments of a pending approval", async () => {
    confirmations.create({ tokenId: "t", tokenName: "c", tool: "apps.add_custom", args: { name: "x", composeYaml: "environment:\n  - API_KEY=topsecret\n" }, summary: "x", needsPerson: true });
    const [pending] = await caller.pendingApprovals();
    expect(JSON.stringify(pending.args)).not.toContain("topsecret");
  });

  it("passes a denial reason to the agent", async () => {
    const pending = confirmations.create({ tokenId: "t", tokenName: "c", tool: "apps.install", args: {}, summary: "x", needsPerson: true });
    await caller.decide({ id: pending.id, approved: false, reason: "Not this week" });
    expect(confirmations.find(pending.id, "t")?.decision?.reason).toBe("Not this week");
    expect((await audit.list(1))[0]).toMatchObject({ action: "approvals.deny", reason: "Not this week" });
  });
});
