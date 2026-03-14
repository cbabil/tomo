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
      status: "running" | "stopped" | "error";
      webPort?: number;
    }> => [],
  ),
  install: t.procedure
    .input(z.object({ appId: z.string() }))
    .mutation((): void => {}),
  uninstall: t.procedure
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
  categories: t.procedure.query((): string[] => []),
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
});

const _appRouter = t.router({
  user: userRouter,
  system: systemRouter,
  apps: appsRouter,
});

export type AppRouter = typeof _appRouter;
