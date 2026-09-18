import { createLogger } from "./logger.js";
import path from "node:path";
import { PORT, STATIC_DIR, CORS_ORIGIN, TOMO_DATA_DIR } from "./config.js";
import { Store } from "./store.js";
import { User } from "./user.js";
import { Docker } from "./docker.js";
import { Hardware } from "./hardware.js";
import { AppStore } from "./app-store.js";
import { TemplateRegistry } from "./templates.js";
import { Apps } from "./apps.js";
import { TraefikProxy } from "./traefik-proxy.js";
import { Notifications } from "./notifications.js";
import { ApiTokens } from "./api-tokens.js";
import { AuditLog } from "./audit-log.js";
import { PolicyStore } from "./mcp/policies.js";
import { Confirmations } from "./mcp/confirmations.js";
import { createServer } from "./server.js";

const log = createLogger("tomod");

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

export class Tomod {
  private readonly store: Store;
  private readonly user: User;
  private readonly docker: Docker;
  private readonly hardware: Hardware;
  private readonly appStore: AppStore;
  private readonly templateRegistry: TemplateRegistry;
  private readonly proxy: TraefikProxy;
  private readonly apps: Apps;
  private readonly notifications: Notifications;
  private readonly tokens: ApiTokens;
  private readonly audit: AuditLog;
  private readonly policies: PolicyStore;
  private readonly confirmations: Confirmations;
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.store = new Store();
    this.user = new User();
    this.docker = new Docker();
    this.hardware = new Hardware();
    this.appStore = new AppStore(this.store);
    this.templateRegistry = new TemplateRegistry();
    this.proxy = new TraefikProxy(this.docker);
    this.apps = new Apps(this.appStore, this.templateRegistry, this.docker, this.store, this.proxy);
    this.notifications = new Notifications();
    this.tokens = new ApiTokens(path.join(TOMO_DATA_DIR, "api-tokens.json"));
    this.audit = new AuditLog(path.join(TOMO_DATA_DIR, "audit.jsonl"));
    this.policies = new PolicyStore(TOMO_DATA_DIR);
    this.confirmations = new Confirmations();
  }

  async start(): Promise<void> {
    log.info("Starting tomod...");

    await Promise.all([this.store.load(), this.user.init(), this.tokens.load(), this.policies.load()]);
    await this.proxy.init();
    await this.templateRegistry.init();
    await this.appStore.sync();
    await this.apps.init();

    const port = PORT;
    const staticDir = STATIC_DIR;
    const corsOrigin = CORS_ORIGIN;

    const server = createServer(
      {
        user: this.user,
        apps: this.apps,
        appStore: this.appStore,
        templateRegistry: this.templateRegistry,
        hardware: this.hardware,
        docker: this.docker,
        tokens: this.tokens,
        audit: this.audit,
        policies: this.policies,
        confirmations: this.confirmations,
      },
      { port, staticDir, corsOrigin },
    );

    const httpServer = await server.start();

    // Seed default apps in the background: a first-run install triggers a
    // docker image pull, which must not block the daemon from binding.
    void this.apps.seedDefaults();

    this.syncAppStore();
    this.syncTimer = setInterval(() => this.syncAppStore(), SYNC_INTERVAL_MS);

    this.setupGracefulShutdown(httpServer);

    log.info("tomod is ready", { port });
  }

  private syncAppStore(): void {
    this.appStore.sync().catch((err) => {
      log.error("App store sync failed", { error: String(err) });
      this.notifications.create(
        "error",
        "Sync Failed",
        `App store sync failed: ${String(err)}`,
      );
    });
  }

  private setupGracefulShutdown(httpServer: import("node:http").Server): void {
    const shutdown = async (signal: string): Promise<void> => {
      log.info("Received shutdown signal", { signal });

      if (this.syncTimer) {
        clearInterval(this.syncTimer);
        this.syncTimer = null;
      }

      httpServer.close();
      await this.tokens.flush();
      log.info("tomod shutdown complete");
      process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  }
}

const tomod = new Tomod();
tomod.start().catch((err) => {
  log.error("Failed to start tomod", { error: String(err) });
  process.exit(1);
});
