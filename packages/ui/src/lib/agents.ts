/** Presets for new agents and the configuration snippets that connect a client to Tomo. */

export type AgentScope = "manage" | "admin";

export interface AgentPreset {
  key: "claudeCode" | "script" | "admin" | "custom";
  scope: AgentScope;
  expiresInDays: number | null;
  defaultName: string;
}

export const AGENT_PRESETS: AgentPreset[] = [
  { key: "claudeCode", scope: "manage", expiresInDays: 90, defaultName: "Claude Code" },
  { key: "script", scope: "manage", expiresInDays: 365, defaultName: "Automation script" },
  { key: "admin", scope: "admin", expiresInDays: 30, defaultName: "Full control" },
  { key: "custom", scope: "manage", expiresInDays: 90, defaultName: "" },
];

export const EXPIRY_CHOICES = [30, 90, 365, null] as const;
export const GRACE_CHOICES_MINUTES = [0, 60, 1440, 10080] as const;

export const CONNECT_CLIENTS = ["claudeCode", "claudeDesktop", "cursor", "curl"] as const;
export type ConnectClient = (typeof CONNECT_CLIENTS)[number];

const json = (value: unknown) => JSON.stringify(value, null, 2);

/** What to paste into each client so it reaches this Tomo with the token. */
export function connectSnippet(client: ConnectClient, token: string, origin: string): string {
  const url = `${origin}/mcp`;
  const headers = { Authorization: `Bearer ${token}` };
  switch (client) {
    case "claudeCode":
      return `claude mcp add --transport http tomo ${url} --header "Authorization: Bearer ${token}"`;
    case "claudeDesktop":
      return json({ mcpServers: { tomo: { command: "npx", args: ["-y", "mcp-remote", url, "--header", `Authorization: Bearer ${token}`] } } });
    case "cursor":
      return json({ mcpServers: { tomo: { url, headers } } });
    case "curl":
      return [
        `curl -s ${url} \\`,
        `  -H "Authorization: Bearer ${token}" \\`,
        `  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \\`,
        `  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
      ].join("\n");
  }
}
