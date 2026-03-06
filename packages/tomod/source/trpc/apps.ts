import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, privateProcedure } from "./middleware.js";
import type { Apps } from "../apps.js";
import type { AppStore } from "../app-store.js";

const appIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "Invalid app ID format");

export function createAppsRouter(apps: Apps, appStore: AppStore) {
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
      return apps.listInstalled().map((app) => {
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
  });
}
