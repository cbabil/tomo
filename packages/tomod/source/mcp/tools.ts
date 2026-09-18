/**
 * The tools an agent can call. Each names its inputs, says what it will do
 * in plain words (for confirmations), and calls the same services the
 * desktop uses. Scopes and guardrails are applied by the server, not here.
 */
import { z } from "zod";
import type { Apps } from "../apps.js";
import type { AppStore } from "../app-store.js";
import type { Hardware } from "../hardware.js";
import {
  appIdSchema,
  httpUrlSchema,
  openPathSchema,
  containerPortSchema,
  MAX_COMPOSE_YAML_LENGTH,
} from "../schemas.js";

const MAX_LOG_LINES = 500;

export interface ToolServices {
  apps: Apps;
  appStore: AppStore;
  hardware: Hardware;
}

export const TOOL_GROUPS = ["read", "operate", "install", "custom", "remove"] as const;
export type ToolGroup = (typeof TOOL_GROUPS)[number];

export interface ToolDefinition {
  name: string;
  /** What kind of action this is. Everything but "read" changes state. */
  group: ToolGroup;
  description: string;
  input: z.ZodRawShape;
  /** One sentence describing what this call will do, shown when a confirmation is required. */
  summary: (args: Record<string, unknown>) => string;
  run: (args: Record<string, unknown>, services: ToolServices) => Promise<unknown>;
}

const appId = appIdSchema.describe("The app id, as returned by apps.list");
const containerPort = containerPortSchema;

export const TOOLS: ToolDefinition[] = [
  {
    name: "apps.list",
    group: "read",
    description: "Installed apps with their status, type, port, and open path.",
    input: {},
    summary: () => "List installed apps",
    run: async (_args, s) => s.apps.listInstalled(),
  },
  {
    name: "apps.get",
    group: "read",
    description: "One installed app in detail, including the compose source of a custom app.",
    input: { appId },
    summary: (a) => `Show app ${a.appId}`,
    run: async (a, s) => {
      const app = s.apps.listInstalled().find((x) => x.id === a.appId);
      if (!app) throw new Error(`App not installed: ${String(a.appId)}`);
      return app;
    },
  },
  {
    name: "apps.logs",
    group: "read",
    description: "Recent container log lines for an app.",
    input: { appId, lines: z.number().int().min(1).max(MAX_LOG_LINES).default(100) },
    summary: (a) => `Read logs of ${a.appId}`,
    run: async (a, s) => ({ logs: await s.apps.getLogs(String(a.appId), Number(a.lines ?? 100)) }),
  },
  {
    name: "store.search",
    group: "read",
    description: "Search the configured app stores.",
    input: { query: z.string().min(1).max(100) },
    summary: (a) => `Search the store for ${a.query}`,
    run: async (a, s) => s.appStore.searchApps(String(a.query)),
  },
  {
    name: "system.stats",
    group: "read",
    description: "CPU, memory, and disk usage, as the desktop widgets show them.",
    input: {},
    summary: () => "Read system stats",
    run: async (_a, s) => s.hardware.getAllStats(),
  },
  {
    name: "system.info",
    group: "read",
    description: "Host name, operating system, and uptime.",
    input: {},
    summary: () => "Read system info",
    run: async (_a, s) => s.hardware.getSystemInfo(),
  },
  {
    name: "apps.start",
    group: "operate",
    description: "Start a stopped app and wait until it answers.",
    input: { appId },
    summary: (a) => `Start ${a.appId}`,
    run: async (a, s) => s.apps.start(String(a.appId)).then(() => ({ ok: true })),
  },
  {
    name: "apps.stop",
    group: "operate",
    description: "Stop a running app.",
    input: { appId },
    summary: (a) => `Stop ${a.appId}`,
    run: async (a, s) => s.apps.stop(String(a.appId)).then(() => ({ ok: true })),
  },
  {
    name: "apps.restart",
    group: "operate",
    description: "Restart an app and wait until it answers.",
    input: { appId },
    summary: (a) => `Restart ${a.appId}`,
    run: async (a, s) => s.apps.restart(String(a.appId)).then(() => ({ ok: true })),
  },
  {
    name: "apps.update",
    group: "install",
    description: "Update an app: store apps from the store, custom apps by pulling newer images.",
    input: { appId },
    summary: (a) => `Update ${a.appId} to its newest version and restart it`,
    run: async (a, s) => s.apps.update(String(a.appId)).then(() => ({ ok: true })),
  },
  {
    name: "apps.install",
    group: "install",
    description: "Install an app from a configured store by its store id.",
    input: { appId },
    summary: (a) => `Install ${a.appId} from the app store and start it`,
    run: async (a, s) => s.apps.install(String(a.appId)),
  },
  {
    name: "apps.add_custom",
    group: "custom",
    description: "Add a custom Docker app from an image or a compose file, as the Add dialog does.",
    input: {
      name: z.string().min(1).max(64),
      image: z.string().optional(),
      composeYaml: z.string().max(MAX_COMPOSE_YAML_LENGTH).optional(),
      containerPort,
      path: openPathSchema.optional().describe("Where the tile opens, e.g. /ui"),
      icon: httpUrlSchema.optional(),
    },
    summary: (a) => `Add custom app ${a.name} from ${a.image ?? "the given compose file"} on port ${a.containerPort}`,
    run: async (a, s) =>
      s.apps.installCustom({
        name: String(a.name),
        image: a.image as string | undefined,
        composeYaml: a.composeYaml as string | undefined,
        containerPort: Number(a.containerPort),
        path: a.path as string | undefined,
        icon: a.icon as string | undefined,
      }),
  },
  {
    name: "apps.edit_custom",
    group: "custom",
    description: "Change a custom app's image, compose file, port, open path, or icon, and redeploy it keeping its data.",
    input: {
      appId,
      path: openPathSchema.optional(),
      icon: httpUrlSchema.optional(),
      source: z
        .object({
          image: z.string().optional(),
          composeYaml: z.string().max(MAX_COMPOSE_YAML_LENGTH).optional(),
          containerPort,
        })
        .optional(),
    },
    summary: (a) => (a.source ? `Redeploy ${a.appId} with new settings, keeping its data` : `Edit ${a.appId}`),
    run: async (a, s) =>
      s.apps.updateCustom(String(a.appId), {
        path: a.path as string | undefined,
        icon: a.icon as string | undefined,
        source: a.source as { image?: string; composeYaml?: string; containerPort: number } | undefined,
      }),
  },
  {
    name: "apps.remove",
    group: "remove",
    description: "Remove an app, deleting its containers and data. Needs a person; refused for now.",
    input: { appId },
    summary: (a) => `Remove ${a.appId} and delete its data`,
    run: async (a, s) => s.apps.uninstall(String(a.appId)).then(() => ({ ok: true })),
  },
];
