import { router } from "./middleware.js";
import { createUserRouter } from "./user.js";
import { createAppsRouter } from "./apps.js";
import { createSystemRouter } from "./system.js";
import type { User } from "../user.js";
import type { Apps } from "../apps.js";
import type { AppStore } from "../app-store.js";
import type { Hardware } from "../hardware.js";
import type { Docker } from "../docker.js";

export interface RouterDependencies {
  user: User;
  apps: Apps;
  appStore: AppStore;
  hardware: Hardware;
  docker: Docker;
}

export function createAppRouter(deps: RouterDependencies) {
  return router({
    user: createUserRouter(deps.user),
    apps: createAppsRouter(deps.apps, deps.appStore),
    system: createSystemRouter(deps.hardware, deps.docker),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
