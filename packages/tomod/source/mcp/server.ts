/**
 * The MCP endpoint at /mcp. Every request carries a bearer API token; the
 * server is built per request so nothing is shared between tokens. Each
 * tool call passes through the guardrails, and every outcome is audited.
 */
import type { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createLogger } from "../logger.js";
import { redact } from "../audit-log.js";
import { resolvePrincipal } from "../trpc/middleware.js";
import type { RouterDependencies } from "../trpc/router.js";
import type { TokenPrincipal } from "../api-tokens.js";
import { Guardrails, BUILT_IN_RULES } from "./guardrails.js";
import { Confirmations } from "./confirmations.js";
import { TOOLS, type ToolDefinition } from "./tools.js";

const log = createLogger("mcp");

const INSTRUCTIONS = `You are connected to Tomo, a self-hosted app platform, with an API token.
Read tools (apps.list, apps.get, apps.logs, store.search, system.stats, system.info) run at once.
Changes (apps.install, apps.update, apps.add_custom, apps.edit_custom) return "confirmation_required"
with an id and a summary: restate the summary to the user, then call tomo.confirm with the id.
Removing an app, and turning on privileged mode or own sign-in, must be done by a person on the Tomo desktop.
Call tomo.whoami to learn this token's name and scope.`;

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

/**
 * registerTool's generics infer the callback type from the zod shape. With a
 * shape that is only known at runtime that inference is unboundedly deep, so
 * tools are registered through this narrower view of the same method.
 */
interface LooseToolRegistry {
  registerTool(
    name: string,
    config: { description: string; inputSchema: z.ZodRawShape },
    cb: (args: Record<string, unknown> | undefined) => Promise<ToolResult>,
  ): unknown;
}

/** Every result leaves through here, masked, so no tool can return a secret. */
const text = (value: unknown): ToolResult => {
  const masked = redact(value);
  return { content: [{ type: "text", text: typeof masked === "string" ? masked : JSON.stringify(masked, null, 2) }] };
};
const failure = (message: string): ToolResult => ({ ...text({ error: message }), isError: true });

/** Build the express handler. The guardrail and confirmation state is shared across requests. */
export function createMcpHandler(deps: RouterDependencies) {
  const guardrails = new Guardrails(BUILT_IN_RULES);
  const confirmations = new Confirmations();

  return async (req: Request, res: Response): Promise<void> => {
    const { principal } = resolvePrincipal(req, deps);
    if (principal?.kind !== "token") {
      res.status(401).json({ error: "An API token is required. Create one in Settings, API access." });
      return;
    }
    const server = buildServer(principal, deps, guardrails, confirmations);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  };
}

function buildServer(
  principal: TokenPrincipal,
  deps: RouterDependencies,
  guardrails: Guardrails,
  confirmations: Confirmations,
): McpServer {
  const server = new McpServer({ name: "tomo", version: "1" }, { instructions: INSTRUCTIONS });

  const audit = (action: string, args: unknown, outcome: "ok" | "denied" | "error", reason?: string) =>
    deps.audit.record({ principal: { kind: "token", id: principal.id, name: principal.name }, action, args, outcome, reason });

  const execute = async (tool: ToolDefinition, args: Record<string, unknown>): Promise<ToolResult> => {
    try {
      const result = await tool.run(args, deps);
      await audit(`mcp:${tool.name}`, args, "ok");
      return text(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await audit(`mcp:${tool.name}`, args, "error", message);
      return failure(message);
    }
  };

  const registry = server as unknown as LooseToolRegistry;
  for (const tool of TOOLS) {
    registry.registerTool(tool.name, { description: tool.description, inputSchema: tool.input }, async (rawArgs) => {
      const args = (rawArgs ?? {}) as Record<string, unknown>;
      const decision = guardrails.evaluate(tool.name, args, principal);
      if (decision.effect === "deny") {
        await audit(`mcp:${tool.name}`, args, "denied", decision.reason);
        return failure(decision.reason ?? `Refused by rule ${decision.rule}`);
      }
      if (decision.effect === "agent_confirm") {
        const pending = confirmations.create({ tokenId: principal.id, tool: tool.name, args, summary: tool.summary(args) });
        return text({
          status: "confirmation_required",
          confirmationId: pending.id,
          summary: pending.summary,
          expiresAt: pending.expiresAt,
          next: "Restate the summary to the user, then call tomo.confirm with confirmationId.",
        });
      }
      return execute(tool, args);
    });
  }

  registry.registerTool(
    "tomo.confirm",
    { description: "Run a change after restating it: pass the confirmationId you were given.", inputSchema: { confirmationId: z.string() } },
    async (args) => {
      const pending = confirmations.take(String(args?.confirmationId ?? ""), principal.id);
      if (!pending) return failure("Unknown, expired, or already used confirmation id");
      const tool = TOOLS.find((t) => t.name === pending.tool);
      if (!tool) return failure(`Unknown tool ${pending.tool}`);
      log.info("Confirmed tool call", { token: principal.id, tool: tool.name });
      return execute(tool, pending.args);
    },
  );

  registry.registerTool(
    "tomo.pending_confirmations",
    { description: "Changes this token asked for that still need tomo.confirm.", inputSchema: {} },
    async () => text(confirmations.listFor(principal.id)),
  );

  registry.registerTool(
    "tomo.whoami",
    { description: "This token's name, scope, and what the scope allows.", inputSchema: {} },
    async () =>
      text({
        name: principal.name,
        scope: principal.scope,
        allows:
          principal.scope === "admin"
            ? "read, operate, install, edit custom apps, and change app stores"
            : "read, operate, install, and edit custom apps",
      }),
  );

  return server;
}
