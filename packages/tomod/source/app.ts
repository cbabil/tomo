import { createLogger } from "./logger.js";
import { waitForApp } from "./upstream-ready.js";
import type { Docker } from "./docker.js";

const log = createLogger("app");

export type AppType = "store" | "custom" | "template" | "external";

export type AppStatus =
  | "unknown"
  | "installing"
  | "starting"
  | "ready"
  | "running"
  | "restarting"
  | "stopping"
  | "stopped";

export interface ProxyTarget {
  service: string;
  port: number;
  hostPort?: number;
  hostNetwork?: boolean;
  /** The app has its own sign-in; serve it without the Tomo login. */
  ownAuth?: boolean;
}

/** What the user gave Tomo to build a custom app, kept so it can be edited. */
export interface CustomSource {
  image?: string;
  composeYaml?: string;
  containerPort: number;
  allowPrivileged?: boolean;
}

export interface AppInstance {
  id: string;
  name: string;
  version: string;
  status: AppStatus;
  port: number | undefined;
  installedAt: string;
  dataDir: string;
  proxyTarget?: ProxyTarget;
  type: AppType;
  /** Where the tile opens, e.g. "/ui". Undefined means "/". */
  path?: string;
  icon?: string;
  /** Set for apps installed from a template. */
  templateId?: string;
  /** Set for custom apps. */
  source?: CustomSource;
}

export class App {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly port: number | undefined;
  readonly installedAt: string;
  readonly dataDir: string;
  readonly proxyTarget: ProxyTarget | undefined;
  readonly type: AppType;
  readonly path: string | undefined;
  readonly icon: string | undefined;
  readonly templateId: string | undefined;
  readonly source: CustomSource | undefined;
  private status: AppStatus;
  private readonly docker: Docker;

  constructor(
    props: {
      id: string;
      name: string;
      version: string;
      port?: number;
      installedAt: string;
      dataDir: string;
      status?: AppStatus;
      proxyTarget?: ProxyTarget;
      type?: AppType;
      path?: string;
      icon?: string;
      templateId?: string;
      source?: CustomSource;
    },
    docker: Docker,
  ) {
    this.id = props.id;
    this.name = props.name;
    this.version = props.version;
    this.port = props.port;
    this.installedAt = props.installedAt;
    this.dataDir = props.dataDir;
    this.proxyTarget = props.proxyTarget;
    this.type = props.type ?? "store";
    this.path = props.path;
    this.icon = props.icon;
    this.templateId = props.templateId;
    this.source = props.source;
    this.status = props.status ?? "unknown";
    this.docker = docker;
  }

  /** A copy of this app with some fields replaced; everything else, status included, is kept. */
  withChanges(changes: Partial<Omit<AppInstance, "id" | "dataDir">>): App {
    return new App({ ...this.toJSON(), ...changes }, this.docker);
  }

  getStatus(): AppStatus {
    return this.status;
  }

  setStatus(status: AppStatus): void {
    this.status = status;
    log.info("App status changed", { id: this.id, status });
  }

  private get composePath(): string {
    return `${this.dataDir}/docker-compose.yml`;
  }

  private get projectName(): string {
    return `tomo-${this.id}`;
  }

  /**
   * Run a lifecycle change. The app shows `during` while it runs and `settled`
   * once it succeeds. On failure the previous status is restored and the error
   * rethrown.
   */
  private async transition(
    during: AppStatus,
    settled: AppStatus,
    work: () => Promise<void>,
  ): Promise<void> {
    const previous = this.status;
    this.status = during;
    try {
      await work();
      this.status = settled;
    } catch (err) {
      this.status = previous;
      throw err;
    }
  }

  async start(): Promise<void> {
    // A fresh install stays "installing" while images are pulled and containers
    // are created, so the UI can tell that phase from waiting for the app.
    const during = this.status === "installing" ? "installing" : "starting";
    await this.transition(during, "running", async () => {
      await this.docker.composeUp(this.composePath, this.projectName);
      this.status = "starting";
      await this.waitUntilReachable();
    });
    log.info("App started", { id: this.id });
  }

  /** Stay in the transitional status until the proxy can reach the app. */
  private async waitUntilReachable(): Promise<void> {
    if (this.proxyTarget) await waitForApp(this.id, this.proxyTarget);
  }

  /**
   * Update an app whose images are not versioned by a store manifest: pull the
   * newest images, then let compose recreate the containers that changed.
   */
  async pullAndRecreate(): Promise<void> {
    await this.transition("restarting", "running", async () => {
      await this.docker.composePull(this.composePath, this.projectName);
      await this.docker.composeUp(this.composePath, this.projectName);
      await this.waitUntilReachable();
    });
    log.info("App images updated", { id: this.id });
  }

  async stop(): Promise<void> {
    await this.transition("stopping", "stopped", () =>
      this.docker.composeDown(this.projectName),
    );
    log.info("App stopped", { id: this.id });
  }

  async restart(): Promise<void> {
    await this.transition("restarting", "running", async () => {
      await this.docker.composeDown(this.projectName);
      await this.docker.composeUp(this.composePath, this.projectName);
      await this.waitUntilReachable();
    });
    log.info("App restarted", { id: this.id });
  }

  async syncStatus(): Promise<void> {
    try {
      const containers = await this.docker.listContainers();
      const appContainers = containers.filter((c) =>
        c.name.startsWith(`tomo-${this.id}`),
      );
      if (appContainers.length === 0) {
        this.status = "stopped";
        return;
      }
      const allRunning = appContainers.every((c) => c.state === "running");
      this.status = allRunning ? "running" : "stopped";
    } catch {
      this.status = "stopped";
    }
  }

  async getHealth(): Promise<string> {
    try {
      const containers = await this.docker.listContainers();
      const appContainers = containers.filter((c) =>
        c.name.startsWith(`tomo-${this.id}`),
      );
      if (appContainers.length === 0) return "not running";

      const allRunning = appContainers.every((c) => c.state === "running");
      return allRunning ? "healthy" : "degraded";
    } catch {
      return "unknown";
    }
  }

  async getLogs(tail: number = 100): Promise<string> {
    try {
      const containers = await this.docker.listContainers();
      const appContainer = containers.find((c) =>
        c.name.startsWith(`tomo-${this.id}`),
      );
      if (!appContainer) return "No containers found";

      return await this.docker.getContainerLogs(appContainer.id, tail);
    } catch (err) {
      return `Failed to get logs: ${String(err)}`;
    }
  }

  toJSON(): AppInstance {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      status: this.status,
      port: this.port,
      installedAt: this.installedAt,
      dataDir: this.dataDir,
      proxyTarget: this.proxyTarget,
      type: this.type,
      path: this.path,
      icon: this.icon,
      templateId: this.templateId,
      source: this.source,
    };
  }
}
