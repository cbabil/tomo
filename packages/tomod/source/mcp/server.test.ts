import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createMcpHandler } from "./server.js";
import { ApiTokens } from "../api-tokens.js";
import { AuditLog } from "../audit-log.js";
import { PolicyStore } from "../mcp/policies.js";
import { Confirmations } from "../mcp/confirmations.js";
import type { RouterDependencies } from "../trpc/router.js";

/** Stubbed services: enough for the tools to run, recording what they were asked. */
function stubDeps(dir: string, tokens: ApiTokens, audit: AuditLog, policies: PolicyStore, confirmations: Confirmations) {
  const installed = [
    {
      id: "gitea",
      name: "Gitea",
      status: "running",
      type: "custom",
      source: { composeYaml: "services:\n  app:\n    environment:\n      - DB_PASSWORD=hunter2\n", containerPort: 3000 },
    },
  ];
  const apps = {
    listInstalled: vi.fn(() => installed),
    getLogs: vi.fn(async () => "DATABASE_URL=postgresql://u:s3cret@db/x\nready"),
    install: vi.fn(async (id: string) => ({ id, status: "running" })),
    restart: vi.fn(async () => {}),
    uninstall: vi.fn(async () => {}),
  };
  return {
    deps: {
      apps,
      appStore: { searchApps: vi.fn(() => []) },
      hardware: { getAllStats: vi.fn(async () => ({ cpu: 1 })), getSystemInfo: vi.fn(async () => ({ hostname: "pi" })) },
      user: { validateToken: () => { throw new Error("no"); } },
      tokens,
      audit,
      policies,
      confirmations,
    } as unknown as RouterDependencies,
    apps,
  };
}

const parse = (result: { content: Array<{ type: string; text?: string }> }) =>
  JSON.parse(result.content[0]?.text ?? "null") as Record<string, unknown>;

describe("MCP endpoint", () => {
  let dir: string;
  let server: Server;
  let url: string;
  let manageToken: string;
  let adminToken: string;
  let apps: ReturnType<typeof stubDeps>["apps"];
  let audit: AuditLog;
  let confirmations: Confirmations;
  let policies: PolicyStore;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "tomo-mcp-"));
    const tokens = new ApiTokens(path.join(dir, "tokens.json"));
    await tokens.load();
    manageToken = (await tokens.create({ name: "claude", scope: "manage", expiresInDays: 1 })).token;
    adminToken = (await tokens.create({ name: "ops", scope: "admin", expiresInDays: 1 })).token;
    audit = new AuditLog(path.join(dir, "audit.jsonl"));
    policies = new PolicyStore(dir);
    await policies.load();
    confirmations = new Confirmations();
    const stubbed = stubDeps(dir, tokens, audit, policies, confirmations);
    apps = stubbed.apps;

    const app = express();
    app.use(express.json());
    app.all("/mcp", createMcpHandler(stubbed.deps));
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as { port: number };
    url = `http://127.0.0.1:${address.port}/mcp`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  });

  async function connect(token: string): Promise<Client> {
    const client = new Client({ name: "test", version: "1" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }),
    );
    return client;
  }

  it("refuses requests without a token", async () => {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(res.status).toBe(401);
  });

  it("lists tools and answers reads at once, with logs redacted", async () => {
    const client = await connect(manageToken);
    const tools = (await client.listTools()).tools.map((t) => t.name);
    expect(tools).toEqual(expect.arrayContaining(["apps.list", "apps.install", "apps.remove", "tomo.confirm", "tomo.whoami"]));

    const list = await client.callTool({ name: "apps.list", arguments: {} });
    const listText = (list.content as Array<{ text: string }>)[0].text;
    expect(JSON.parse(listText)).toEqual([expect.objectContaining({ id: "gitea" })]);
    expect(listText).not.toContain("hunter2");
    expect(listText).toContain("DB_PASSWORD=[redacted]");

    const logs = parse((await client.callTool({ name: "apps.logs", arguments: { appId: "gitea" } })) as never);
    expect(String(logs.logs)).toContain("[redacted]");
    expect(String(logs.logs)).not.toContain("s3cret");

    const who = parse((await client.callTool({ name: "tomo.whoami", arguments: {} })) as never);
    expect(who).toMatchObject({ name: "claude", scope: "manage" });
    await client.close();
  });

  it("makes the agent restate an install, then runs it on confirm", async () => {
    const client = await connect(manageToken);
    const first = parse((await client.callTool({ name: "apps.install", arguments: { appId: "immich" } })) as never);
    expect(first.status).toBe("confirmation_required");
    expect(first.summary).toContain("immich");
    expect(apps.install).not.toHaveBeenCalled();

    const pendingResult = await client.callTool({ name: "tomo.pending_confirmations", arguments: {} });
    const pending = parse(pendingResult as never);
    expect(Array.isArray(pending) ? pending : []).toHaveLength(1);

    const yamlAsk = parse(
      (await client.callTool({
        name: "apps.add_custom",
        arguments: { name: "x", composeYaml: "services:\n  app:\n    environment:\n      - API_KEY=topsecret\n", containerPort: 80 },
      })) as never,
    );
    expect(yamlAsk.status).toBe("confirmation_required");
    const listed = (await client.callTool({ name: "tomo.pending_confirmations", arguments: {} })).content as Array<{ text: string }>;
    expect(listed[0].text).not.toContain("topsecret");

    const done = parse(
      (await client.callTool({ name: "tomo.confirm", arguments: { confirmationId: first.confirmationId } })) as never,
    );
    expect(done).toMatchObject({ id: "immich" });
    expect(apps.install).toHaveBeenCalledWith("immich");

    const again = await client.callTool({ name: "tomo.confirm", arguments: { confirmationId: first.confirmationId } });
    expect(again.isError).toBe(true);
    await client.close();
  });

  it("holds removal for a person, then runs it once approved", async () => {
    const client = await connect(adminToken);
    const ask = parse((await client.callTool({ name: "apps.remove", arguments: { appId: "gitea" } })) as never);
    expect(ask.status).toBe("approval_required");
    expect(apps.uninstall).not.toHaveBeenCalled();

    const waiting = parse((await client.callTool({ name: "tomo.confirm", arguments: { confirmationId: ask.confirmationId } })) as never);
    expect(waiting.status).toBe("waiting_for_approval");
    expect(confirmations.awaitingPerson().map((a) => a.tool)).toEqual(["apps.remove"]);

    confirmations.decide(String(ask.confirmationId), true, "admin");
    const done = parse((await client.callTool({ name: "tomo.confirm", arguments: { confirmationId: ask.confirmationId } })) as never);
    expect(done).toEqual({ ok: true });
    expect(apps.uninstall).toHaveBeenCalledWith("gitea");
    await client.close();
  });

  it("refuses removal below admin scope, and a denied approval never runs", async () => {
    const manage = await connect(manageToken);
    const refused = await manage.callTool({ name: "apps.remove", arguments: { appId: "gitea" } });
    expect(refused.isError).toBe(true);
    await manage.close();

    const admin = await connect(adminToken);
    const ask = parse((await admin.callTool({ name: "apps.remove", arguments: { appId: "gitea" } })) as never);
    confirmations.decide(String(ask.confirmationId), false, "admin");
    const denied = await admin.callTool({ name: "tomo.confirm", arguments: { confirmationId: ask.confirmationId } });
    expect(denied.isError).toBe(true);
    await admin.close();
    expect(apps.uninstall).toHaveBeenCalledTimes(1);
  });

  it("audits restatements, approvals, and observed rules with the rule name", async () => {
    await policies.save({ rulesYaml: "- name: watch-restarts\n  match:\n    tools: [apps.restart]\n  effect: deny\n  observe: true\n" });
    const client = await connect(adminToken);
    await client.callTool({ name: "apps.install", arguments: { appId: "immich" } });
    await client.callTool({ name: "apps.restart", arguments: { appId: "gitea" } });
    const ask = parse((await client.callTool({ name: "apps.remove", arguments: { appId: "gitea" } })) as never);
    confirmations.decide(String(ask.confirmationId), true, "pi");
    await client.callTool({ name: "tomo.confirm", arguments: { confirmationId: ask.confirmationId } });
    await client.close();
    await policies.save({ rulesYaml: "" });

    const recent = await audit.list(10);
    expect(recent.find((e) => e.action === "mcp:apps.install")).toMatchObject({ outcome: "restated", rule: "restate-changes" });
    expect(recent.find((e) => e.action === "mcp:apps.restart" && e.outcome === "observed")).toMatchObject({ rule: "watch-restarts" });
    expect(recent.find((e) => e.action === "mcp:apps.restart" && e.outcome === "ok")).toBeDefined();
    expect(recent.filter((e) => e.action === "mcp:apps.remove").slice(0, 2).map((e) => e.outcome)).toEqual(["ok", "pending"]);
    expect(recent.find((e) => e.action === "mcp:apps.remove" && e.outcome === "ok")?.reason).toContain("pi");
  });

  it("applies owner rules from policies.yaml at once", async () => {
    await policies.save({ rulesYaml: "- name: no-restarts\n  match:\n    tools: [apps.restart]\n  effect: deny\n  message: Not now\n" });
    const client = await connect(manageToken);
    const result = await client.callTool({ name: "apps.restart", arguments: { appId: "gitea" } });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0].text).toContain("Not now");
    await client.close();
    await policies.save({ rulesYaml: "" });
  });
});
