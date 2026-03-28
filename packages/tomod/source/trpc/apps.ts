import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, privateProcedure } from "./middleware.js";
import type { Apps } from "../apps.js";
import type { AppStore } from "../app-store.js";
import type { TemplateRegistry } from "../templates.js";

const appIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "Invalid app ID format");

const httpUrlSchema = z
  .string()
  .url()
  .refine(
    (u) => /^https?:\/\//i.test(u),
    "Only http and https URLs are allowed",
  );

const MAX_EXTERNAL_APPS = 100;
const MAX_COMPOSE_YAML_LENGTH = 32_000;

export function createAppsRouter(
  apps: Apps,
  appStore: AppStore,
  templateRegistry: TemplateRegistry,
) {
  return router({
    list: privateProcedure.query(() => {
      return appStore.listApps();
    }),

    search: privateProcedure
      .input(z.object({ query: z.string() }))
      .query(({ input }) => {
        return appStore.searchApps(input.query);
      }),

    get: privateProcedure
      .input(z.object({ appId: appIdSchema }))
      .query(({ input }) => {
        const app = appStore.getApp(input.appId);
        if (!app) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `App not found: ${input.appId}`,
          });
        }
        return app;
      }),

    installed: privateProcedure.query(() => {
      const dockerApps = apps.listInstalled().map((app) => {
        const manifest = appStore.getApp(app.id);
        return {
          ...app,
          icon: manifest?.icon ?? "",
          tagline: manifest?.tagline ?? "",
          category: manifest?.category ?? "",
          developer: manifest?.developer ?? "",
          webPort: app.proxyTarget?.hostPort,
        };
      });

      const externalApps = apps.listExternal().map((e) => ({
        id: e.id,
        name: e.name,
        version: "",
        status: "external" as const,
        port: undefined,
        installedAt: e.addedAt,
        dataDir: "",
        type: "external" as const,
        icon: e.icon ?? "",
        tagline: "",
        category: "custom",
        developer: "",
        webPort: undefined,
        externalUrl: e.url,
      }));

      return [...dockerApps, ...externalApps];
    }),

    install: privateProcedure
      .input(z.object({ appId: appIdSchema }))
      .mutation(async ({ input }) => {
        return apps.install(input.appId);
      }),

    uninstall: privateProcedure
      .input(z.object({ appId: appIdSchema }))
      .mutation(async ({ input }) => {
        await apps.uninstall(input.appId);
        return { success: true };
      }),

    start: privateProcedure
      .input(z.object({ appId: appIdSchema }))
      .mutation(async ({ input }) => {
        await apps.start(input.appId);
        return { success: true };
      }),

    stop: privateProcedure
      .input(z.object({ appId: appIdSchema }))
      .mutation(async ({ input }) => {
        await apps.stop(input.appId);
        return { success: true };
      }),

    restart: privateProcedure
      .input(z.object({ appId: appIdSchema }))
      .mutation(async ({ input }) => {
        await apps.restart(input.appId);
        return { success: true };
      }),

    update: privateProcedure
      .input(z.object({ appId: appIdSchema }))
      .mutation(async ({ input }) => {
        await apps.update(input.appId);
        return { success: true };
      }),

    categories: privateProcedure.query(() => {
      return appStore.getCategories();
    }),

    custom: router({
      installDocker: privateProcedure
        .input(
          z
            .object({
              name: z.string().min(1).max(64),
              image: z.string().optional(),
              composeYaml: z.string().max(MAX_COMPOSE_YAML_LENGTH).optional(),
              containerPort: z.number().int().min(1).max(65535),
              icon: httpUrlSchema.optional(),
            })
            .refine(
              (d) => d.image || d.composeYaml,
              "Provide image or compose YAML",
            ),
        )
        .mutation(async ({ input }) => {
          return apps.installCustom(input);
        }),

      addExternal: privateProcedure
        .input(
          z.object({
            name: z.string().min(1).max(64),
            url: httpUrlSchema,
            icon: httpUrlSchema.optional(),
          }),
        )
        .mutation(async ({ input }) => {
          const current = apps.listExternal();
          if (current.length >= MAX_EXTERNAL_APPS) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `Maximum of ${MAX_EXTERNAL_APPS} external apps reached`,
            });
          }
          return apps.addExternal(input);
        }),

      removeExternal: privateProcedure
        .input(z.object({ id: appIdSchema }))
        .mutation(async ({ input }) => {
          await apps.removeExternal(input.id);
          return { success: true };
        }),

      updateExternal: privateProcedure
        .input(
          z.object({
            id: appIdSchema,
            name: z.string().min(1).max(64).optional(),
            url: httpUrlSchema.optional(),
            icon: httpUrlSchema.optional(),
          }),
        )
        .mutation(async ({ input }) => {
          const { id, ...rest } = input;
          return apps.updateExternal(id, rest);
        }),
    }),

    repos: router({
      list: privateProcedure.query(() => {
        return appStore.listRepos();
      }),

      add: privateProcedure
        .input(
          z.object({
            url: z.string().url(),
            branch: z.string().default("master"),
          }),
        )
        .mutation(async ({ input }) => {
          await appStore.addRepo(input.url, input.branch);
          return { success: true };
        }),

      remove: privateProcedure
        .input(z.object({ url: z.string().url() }))
        .mutation(async ({ input }) => {
          await appStore.removeRepo(input.url);
          return { success: true };
        }),
    }),

    templates: router({
      list: privateProcedure.query(() => {
        return templateRegistry.list();
      }),

      get: privateProcedure
        .input(z.object({ templateId: z.string().min(1).max(64) }))
        .query(({ input }) => {
          const template = templateRegistry.get(input.templateId);
          if (!template) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Template not found: ${input.templateId}`,
            });
          }
          return template;
        }),

      categories: privateProcedure.query(() => {
        return templateRegistry.getCategories();
      }),

      install: privateProcedure
        .input(
          z.object({
            templateId: z.string().min(1).max(64),
            setupValues: z.record(z.string()).optional(),
          }),
        )
        .mutation(async ({ input }) => {
          return apps.installTemplate(input);
        }),
    }),
  });
}
