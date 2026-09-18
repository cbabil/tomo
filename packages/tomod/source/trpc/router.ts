import { router } from "./middleware.js";
import { createUserRouter } from "./user.js";
import { createAppsRouter } from "./apps.js";
import { createSystemRouter } from "./system.js";
import { createTokensRouter } from "./tokens.js";
import type { ApiTokens } from "../api-tokens.js";
import type { AuditLog } from "../audit-log.js";
import type { PolicyStore } from "../mcp/policies.js";
import type { Confirmations } from "../mcp/confirmations.js";
import { createGuardrailsRouter } from "./guardrails.js";
import type { User } from "../user.js";
import type { Apps } from "../apps.js";
import type { AppStore } from "../app-store.js";
import type { TemplateRegistry } from "../templates.js";
import type { Hardware } from "../hardware.js";
import type { Docker } from "../docker.js";

export interface RouterDependencies {
  user: User;
  apps: Apps;
  appStore: AppStore;
  templateRegistry: TemplateRegistry;
  hardware: Hardware;
  docker: Docker;
  tokens: ApiTokens;
  audit: AuditLog;
  policies: PolicyStore;
  confirmations: Confirmations;
}

export function createAppRouter(deps: RouterDependencies) {
  return router({
    user: createUserRouter(deps.user),
    apps: createAppsRouter(deps.apps, deps.appStore, deps.templateRegistry),
    system: createSystemRouter(deps.hardware, deps.docker),
    tokens: createTokensRouter(deps.tokens, deps.audit),
    guardrails: createGuardrailsRouter(deps.policies, deps.confirmations, deps.audit),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
