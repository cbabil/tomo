import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { createLogger } from "./logger.js";
import {
  TOMO_DATA_DIR,
  DOCKER_NETWORK_NAME,
  PORT,
  APP_PORT_MIN,
  APP_PORT_MAX,
} from "./config.js";
import type { Docker } from "./docker.js";
import type { ProxyTarget } from "./app.js";

const log = createLogger("proxy");

const CONTAINER_NAME = "tomo-proxy";
const TRAEFIK_VERSION = "v3.3";
const TRAEFIK_IMAGE = `traefik:${TRAEFIK_VERSION}`;
const PROXY_DIR = path.join(TOMO_DATA_DIR, "traefik");
const STATIC_CONF_PATH = path.join(PROXY_DIR, "traefik.yml");
const DYNAMIC_DIR = path.join(PROXY_DIR, "dynamic");

function generateStaticConfig(): string {
  const appEntryPoints = Array.from(
    { length: APP_PORT_MAX - APP_PORT_MIN + 1 },
    (_, i) => `  app-${APP_PORT_MIN + i}:\n    address: ":${APP_PORT_MIN + i}"`,
  ).join("\n");

  return `entryPoints:
  web:
    address: ":80"
${appEntryPoints}

providers:
  file:
    directory: /etc/traefik/dynamic
    watch: true

log:
  level: WARN
`;
}

function generateTomodConfig(): string {
  return `http:
  routers:
    tomod:
      rule: "PathPrefix(\`/\`)"
      service: tomod
      priority: 1
      middlewares: []

  services:
    tomod:
      loadBalancer:
        servers:
          - url: "http://host.docker.internal:${PORT}"

  middlewares:
    forward-auth:
      forwardAuth:
        address: "http://host.docker.internal:${PORT}/auth/verify"
        authResponseHeaders: []
`;
}

function generateAppConfig(appId: string, target: ProxyTarget): string {
  const containerName = `tomo-${appId}-${target.service}-1`;
  if (!target.hostPort) {
    throw new Error(`Missing hostPort for app ${appId}`);
  }
  const { hostPort } = target;
  return `http:
  routers:
    app-${appId}:
      rule: "PathPrefix(\`/\`)"
      entryPoints:
        - app-${hostPort}
      service: app-${appId}
      middlewares:
        - forward-auth

  services:
    app-${appId}:
      loadBalancer:
        servers:
          - url: "http://${containerName}:${target.port}"

  middlewares:
    forward-auth:
      forwardAuth:
        address: "http://host.docker.internal:${PORT}/auth/verify"
        authResponseHeaders: []
`;
}

export class TraefikProxy {
  private readonly docker: Docker;

  constructor(docker: Docker) {
    this.docker = docker;
  }

  async init(): Promise<void> {
    await mkdir(DYNAMIC_DIR, { recursive: true });
    await writeFile(STATIC_CONF_PATH, generateStaticConfig(), "utf-8");
    await writeFile(
      path.join(DYNAMIC_DIR, "tomod.yml"),
      generateTomodConfig(),
      "utf-8",
    );

    await this.ensureContainer();
    log.info("Traefik proxy initialized");
  }

  async addApp(appId: string, target: ProxyTarget): Promise<void> {
    const confPath = path.join(DYNAMIC_DIR, `app-${appId}.yml`);
    await writeFile(confPath, generateAppConfig(appId, target), "utf-8");
    log.info("Proxy config added for app", { appId, target });
  }

  async removeApp(appId: string): Promise<void> {
    const confPath = path.join(DYNAMIC_DIR, `app-${appId}.yml`);
    try {
      await rm(confPath);
    } catch {
      // Config may not exist
    }
    log.info("Proxy config removed for app", { appId });
  }

  private async ensureContainer(): Promise<void> {
    try {
      const container = this.docker.getRawClient().getContainer(CONTAINER_NAME);
      const info = await container.inspect();

      // Recreate if container doesn't expose the app port range
      const hasAppPorts = `${APP_PORT_MIN}/tcp` in (info.Config.ExposedPorts ?? {});
      if (!hasAppPorts) {
        log.info("Traefik container missing app ports, recreating");
        await container.stop().catch(() => {});
        await container.remove({ force: true });
        await this.createContainer();
        return;
      }

      if (info.State.Running) {
        log.info("Traefik container already running");
        return;
      }
      await container.start();
      log.info("Traefik container started");
    } catch (err: unknown) {
      const msg = String(err);
      if (!msg.includes("no such container") && !msg.includes("404")) {
        log.warn("Unexpected error inspecting proxy container, recreating", {
          error: msg,
        });
      }
      await this.createContainer();
    }
  }

  private async createContainer(): Promise<void> {
    await this.docker.pullImage("traefik", TRAEFIK_VERSION).catch((err) => {
      log.warn("Failed to pull traefik image, using cached", {
        error: String(err),
      });
    });

    const client = this.docker.getRawClient();

    const exposedPorts: Record<string, Record<string, never>> = {
      "80/tcp": {},
    };
    const portBindings: Record<string, Array<{ HostPort: string }>> = {
      "80/tcp": [{ HostPort: "80" }],
    };
    for (let p = APP_PORT_MIN; p <= APP_PORT_MAX; p++) {
      exposedPorts[`${p}/tcp`] = {};
      portBindings[`${p}/tcp`] = [{ HostPort: String(p) }];
    }

    const container = await client.createContainer({
      name: CONTAINER_NAME,
      Image: TRAEFIK_IMAGE,
      ExposedPorts: exposedPorts,
      HostConfig: {
        PortBindings: portBindings,
        Binds: [
          `${STATIC_CONF_PATH}:/etc/traefik/traefik.yml:ro`,
          `${DYNAMIC_DIR}:/etc/traefik/dynamic:ro`,
        ],
        RestartPolicy: { Name: "unless-stopped" },
        ExtraHosts: ["host.docker.internal:host-gateway"],
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [DOCKER_NETWORK_NAME]: {},
        },
      },
    });

    await container.start();
    log.info("Traefik container created and started");
  }
}
