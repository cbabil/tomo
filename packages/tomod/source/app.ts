import { createLogger } from "./logger.js";
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
    this.status = props.status ?? "unknown";
    this.docker = docker;
  }

  getStatus(): AppStatus {
    return this.status;
  }

  setStatus(status: AppStatus): void {
    this.status = status;
    log.info("App status changed", { id: this.id, status });
  }

  async start(): Promise<void> {
    const previous = this.status;
    this.status = "starting";
    try {
      const composePath = `${this.dataDir}/docker-compose.yml`;
      await this.docker.composeUp(composePath, `tomo-${this.id}`);
      this.status = "running";
      log.info("App started", { id: this.id });
    } catch (err) {
      this.status = previous;
      throw err;
    }
  }

  async stop(): Promise<void> {
    const previous = this.status;
    this.status = "stopping";
    try {
      await this.docker.composeDown(`tomo-${this.id}`);
      this.status = "stopped";
      log.info("App stopped", { id: this.id });
    } catch (err) {
      this.status = previous;
      throw err;
    }
  }

  async restart(): Promise<void> {
    const previous = this.status;
    this.status = "restarting";
    try {
      await this.docker.composeDown(`tomo-${this.id}`);
      const composePath = `${this.dataDir}/docker-compose.yml`;
      await this.docker.composeUp(composePath, `tomo-${this.id}`);
      this.status = "running";
      log.info("App restarted", { id: this.id });
    } catch (err) {
      this.status = previous;
      throw err;
    }
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
    };
  }
}
