/**
 * AppRouter type stub for the tRPC client.
 *
 * This defines the expected shape of the tomod tRPC router so the
 * UI can have type-safe procedure calls. Once tomod exports its
 * actual router type, replace this with a direct import.
 */
import { initTRPC } from "@trpc/server";
import { z } from "zod";

const t = initTRPC.create();

const userRouter = t.router({
  hasUser: t.procedure.query((): boolean => false),
  checkUsername: t.procedure
    .input(z.object({ name: z.string() }))
    .query((): { available: boolean } => ({ available: true })),
  register: t.procedure
    .input(z.object({ name: z.string(), password: z.string() }))
    .mutation((): void => {}),
  login: t.procedure
    .input(z.object({ password: z.string() }))
    .mutation((): void => {}),
  logout: t.procedure.mutation((): void => {}),
  me: t.procedure.query((): { name: string } => ({ name: "" })),
  changePassword: t.procedure
    .input(z.object({ oldPassword: z.string(), newPassword: z.string() }))
    .mutation((): void => {}),
});

const systemRouter = t.router({
  stats: t.procedure.query(
    (): {
      cpu: number;
      memory: { used: number; total: number };
      disk: { used: number; total: number };
      uptime: number;
    } => ({
      cpu: 0,
      memory: { used: 0, total: 0 },
      disk: { used: 0, total: 0 },
      uptime: 0,
    }),
  ),
  info: t.procedure.query(
    (): {
      hostname: string;
      os: string;
      platform: string;
      uptime: number;
      kernel: string;
    } => ({
      hostname: "",
      os: "",
      platform: "",
      uptime: 0,
      kernel: "",
    }),
  ),
  docker: t.procedure.query(
    (): {
      version: string;
      apiVersion: string;
      containers: { total: number; running: number };
    } => ({
      version: "",
      apiVersion: "",
      containers: { total: 0, running: 0 },
    }),
  ),
  version: t.procedure.query(
    (): {
      current: string;
      latest: string | null;
      updateAvailable: boolean;
    } => ({
      current: "",
      latest: null,
      updateAvailable: false,
    }),
  ),
  update: t.procedure.mutation(
    (): { success: boolean; version: string } => ({
      success: true,
      version: "",
    }),
  ),
});

const appsRouter = t.router({
  list: t.procedure.query(
    (): Array<{
      id: string;
      name: string;
      tagline: string;
      description: string;
      icon: string;
      category: string;
      version: string;
      repo: string;
      developer: string;
      port?: number;
    }> => [],
  ),
  search: t.procedure
    .input(z.object({ query: z.string() }))
    .query(
      (): Array<{
        id: string;
        name: string;
        tagline: string;
        description: string;
        icon: string;
        category: string;
        version: string;
        repo: string;
        developer: string;
      }> => [],
    ),
  installed: t.procedure.query(
    (): Array<{
      id: string;
      name: string;
      tagline: string;
      description: string;
      icon: string;
      category: string;
      version: string;
      repo: string;
      developer: string;
      status:
        | "running"
        | "stopped"
        | "error"
        | "external"
        | "installing"
        | "starting"
        | "restarting"
        | "stopping";
      webPort?: number;
      webPath?: string;
      ownAuth?: boolean;
      source?: {
        image?: string;
        composeYaml?: string;
        containerPort: number;
        allowPrivileged?: boolean;
      };
      type?: "store" | "custom" | "template" | "external";
      externalUrl?: string;
      hidden?: boolean;
    }> => [],
  ),
  install: t.procedure
    .input(z.object({ appId: z.string() }))
    .mutation((): void => {}),
  uninstall: t.procedure
    .input(z.object({ appId: z.string() }))
    .mutation((): void => {}),
  update: t.procedure
    .input(z.object({ appId: z.string() }))
    .mutation((): void => {}),
  start: t.procedure
    .input(z.object({ appId: z.string() }))
    .mutation((): void => {}),
  stop: t.procedure
    .input(z.object({ appId: z.string() }))
    .mutation((): void => {}),
  restart: t.procedure
    .input(z.object({ appId: z.string() }))
    .mutation((): void => {}),
  logs: t.procedure
    .input(z.object({ appId: z.string(), tail: z.number().default(200) }))
    .query((): { logs: string } => ({ logs: "" })),
  categories: t.procedure.query((): string[] => []),
  custom: t.router({
    installDocker: t.procedure
      .input(
        z.object({
          name: z.string(),
          image: z.string().optional(),
          composeYaml: z.string().optional(),
          containerPort: z.number(),
          path: z.string().optional(),
          icon: z.string().optional(),
          allowPrivileged: z.boolean().optional(),
          ownAuth: z.boolean().optional(),
        }),
      )
      .mutation((): void => {}),
    inspectCompose: t.procedure
      .input(
        z.object({
          composeYaml: z.string(),
          name: z.string(),
          containerPort: z.number().optional(),
        }),
      )
      .query(
        (): {
          service?: string;
          containerPort?: number;
          publishedMapping?: string;
          error?: string;
        } => ({}),
      ),
    addExternal: t.procedure
      .input(
        z.object({
          name: z.string(),
          url: z.string(),
          icon: z.string().optional(),
        }),
      )
      .mutation((): void => {}),
    removeExternal: t.procedure
      .input(z.object({ id: z.string() }))
      .mutation((): { success: boolean } => ({ success: true })),
    updateApp: t.procedure
      .input(
        z.object({
          id: z.string(),
          path: z.string().optional(),
          icon: z.string().optional(),
          ownAuth: z.boolean().optional(),
          source: z
            .object({
              image: z.string().optional(),
              composeYaml: z.string().optional(),
              containerPort: z.number(),
              allowPrivileged: z.boolean().optional(),
            })
            .optional(),
        }),
      )
      .mutation((): void => {}),
    updateExternal: t.procedure
      .input(
        z.object({
          id: z.string(),
          name: z.string().optional(),
          url: z.string().optional(),
          icon: z.string().optional(),
        }),
      )
      .mutation((): void => {}),
  }),
  repos: t.router({
    list: t.procedure.query(
      (): Array<{
        url: string;
        branch: string;
        isDefault: boolean;
      }> => [],
    ),
    add: t.procedure
      .input(z.object({ url: z.string(), branch: z.string().default("master") }))
      .mutation((): { success: boolean } => ({ success: true })),
    remove: t.procedure
      .input(z.object({ url: z.string() }))
      .mutation((): { success: boolean } => ({ success: true })),
  }),
  templates: t.router({
    list: t.procedure.query(
      (): Array<{
        id: string;
        name: string;
        description: string;
        icon: string;
        category: string;
        image: string;
        containerPort: number;
        setupFields?: Array<{
          key: string;
          label: string;
          type: "text" | "path" | "number" | "select" | "boolean";
          default?: string;
          required?: boolean;
          placeholder?: string;
          options?: Array<{ label: string; value: string }>;
          description?: string;
        }>;
      }> => [],
    ),
    get: t.procedure
      .input(z.object({ templateId: z.string() }))
      .query(
        (): {
          id: string;
          name: string;
          description: string;
          icon: string;
          category: string;
          image: string;
          containerPort: number;
          setupFields?: Array<{
            key: string;
            label: string;
            type: "text" | "path" | "number" | "select" | "boolean";
            default?: string;
            required?: boolean;
            placeholder?: string;
            options?: Array<{ label: string; value: string }>;
            description?: string;
          }>;
        } => ({
          id: "",
          name: "",
          description: "",
          icon: "",
          category: "",
          image: "",
          containerPort: 0,
        }),
      ),
    categories: t.procedure.query((): string[] => []),
    install: t.procedure
      .input(
        z.object({
          templateId: z.string(),
          setupValues: z.record(z.string(), z.string()).optional(),
        }),
      )
      .mutation((): void => {}),
  }),
});

const guardrailsRouter = t.router({
  get: t.procedure.query(
    (): {
      builtIn: Array<{ name: string; tools: string[]; effect: string; message?: string }>;
      rulesYaml: string;
      instructions: string;
      shadowed: Array<{ rule: string; by: string }>;
    } => ({ builtIn: [], rulesYaml: "", instructions: "", shadowed: [] }),
  ),
  check: t.procedure
    .input(z.object({ rulesYaml: z.string() }))
    .query((): { errors: string[]; shadowed: Array<{ rule: string; by: string }>; count: number } => ({
      errors: [],
      shadowed: [],
      count: 0,
    })),
  save: t.procedure
    .input(z.object({ rulesYaml: z.string().optional(), instructions: z.string().optional() }))
    .mutation((): { success: boolean } => ({ success: true })),
  pendingApprovals: t.procedure.query(
    (): Array<{ id: string; tokenId: string; tokenName: string; tool: string; summary: string; createdAt: string; expiresAt: string }> =>
      [],
  ),
  decide: t.procedure
    .input(z.object({ id: z.string(), approved: z.boolean() }))
    .mutation((): { success: boolean } => ({ success: true })),
});

const tokensRouter = t.router({
    list: t.procedure.query(
      (): Array<{
        id: string;
        name: string;
        scope: "manage" | "admin";
        createdAt: string;
        lastUsedAt?: string;
        expiresAt?: string;
        revokedAt?: string;
      }> => [],
    ),
    create: t.procedure
      .input(
        z.object({
          name: z.string(),
          scope: z.enum(["manage", "admin"]),
          expiresInDays: z.number().nullable(),
        }),
      )
      .mutation((): { token: string; record: { id: string } } => ({ token: "", record: { id: "" } })),
    rotate: t.procedure
      .input(z.object({ id: z.string() }))
      .mutation((): { token: string; record: { id: string } } => ({ token: "", record: { id: "" } })),
    revoke: t.procedure
      .input(z.object({ id: z.string() }))
      .mutation((): { success: boolean } => ({ success: true })),
    activity: t.procedure
      .input(z.object({ limit: z.number() }))
      .query(
        (): Array<{
          time: string;
          principal: { kind: "user" | "token"; id?: string; name: string };
          action: string;
          outcome: "ok" | "denied" | "error" | "pending";
          reason?: string;
        }> => [],
      ),
  });

const _appRouter = t.router({
  tokens: tokensRouter,
  guardrails: guardrailsRouter,
  user: userRouter,
  system: systemRouter,
  apps: appsRouter,
});

export type AppRouter = typeof _appRouter;
