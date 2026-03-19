import {
  readFile,
  writeFile,
  mkdir,
  rm,
  cp,
  chown,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import yaml from "js-yaml";
import { createLogger } from "./logger.js";
import {
  TOMO_DATA_DIR,
  DOCKER_NETWORK_NAME,
  APP_PORT_MIN,
  APP_PORT_MAX,
} from "./config.js";
import { App, type AppInstance, type AppStatus, type AppType, type ProxyTarget } from "./app.js";
import type { ExternalApp } from "./store.js";
import type { AppStore } from "./app-store.js";
import type { Docker } from "./docker.js";
import type { TraefikProxy } from "./traefik-proxy.js";
import type { Store } from "./store.js";

const log = createLogger("apps");

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[^a-z0-9]/, "a");
}

export class Apps {
  private readonly appStore: AppStore;
  private readonly docker: Docker;
  private readonly store: Store;
  private readonly proxy: TraefikProxy;
  private readonly appsDir: string;
  private readonly instances: Map<string, App> = new Map();
  private readonly pendingPorts: Set<number> = new Set();

  constructor(
    appStore: AppStore,
    docker: Docker,
    store: Store,
    proxy: TraefikProxy,
  ) {
    this.appStore = appStore;
    this.docker = docker;
    this.store = store;
    this.proxy = proxy;
    this.appsDir = path.join(TOMO_DATA_DIR, "apps");
  }

  async init(): Promise<void> {
    await mkdir(this.appsDir, { recursive: true });

    const config = this.store.get();
    // Sequential to avoid port allocation race conditions
    for (const appId of config.apps.installed) {
      await this.loadInstalledApp(appId);
    }
    this.pendingPorts.clear();

    // Regenerate proxy configs for all installed apps with proxy targets
    const appsWithProxy = [...this.instances.values()].filter(
      (app) => app.proxyTarget,
    );
    await Promise.all(
      appsWithProxy.map((app) =>
        this.proxy.addApp(app.id, app.proxyTarget!),
      ),
    );

    log.info("Apps manager initialized", { installed: this.instances.size });
  }

  private safeAppDir(appId: string): string {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(appId)) {
      throw new Error("Invalid app ID format");
    }
    const appDir = path.join(this.appsDir, appId);
    const resolved = path.resolve(appDir);
    if (!resolved.startsWith(path.resolve(this.appsDir))) {
      throw new Error("Invalid app ID: path traversal detected");
    }
    return resolved;
  }

  private async validateComposeFile(composePath: string): Promise<void> {
    const content = await readFile(composePath, "utf-8");
    const raw = content.toLowerCase();

    const forbidden = [
      "privileged",
      "cap_add",
      "network_mode: host",
      "pid: host",
      "ipc: host",
      "userns_mode: host",
      "security_opt",
      "devices:",
      "sysctls:",
      "volumes_from:",
      "/var/run/docker.sock",
      "/etc/shadow",
      "/etc/passwd",
      "/root",
    ];

    for (const pattern of forbidden) {
      if (raw.includes(pattern)) {
        throw new Error(
          `Compose file contains forbidden configuration: ${pattern}`,
        );
      }
    }

    // Check for build: as a YAML key (indented service property), not in comments
    if (/^\s+build:/m.test(raw)) {
      throw new Error("Compose file contains forbidden configuration: build context");
    }
  }

  private async loadInstalledApp(appId: string): Promise<void> {
    const appDir = this.safeAppDir(appId);
    const metaPath = path.join(appDir, "tomo-meta.json");

    let raw: string;
    try {
      raw = await readFile(metaPath, "utf-8");
    } catch {
      log.warn("Missing metadata for installed app", { appId });
      return;
    }

    const meta = JSON.parse(raw) as AppMeta;

    // Migrate: extract proxyTarget from app store source if missing
    const originalTarget = meta.proxyTarget;
    const migratedTarget =
      originalTarget ?? (await this.migrateProxyTarget(appId));
    const proxyTarget = migratedTarget
      ? this.assignHostPort(migratedTarget)
      : undefined;

    const needsMigration = !originalTarget && proxyTarget;
    const needsHostPort = !needsMigration && proxyTarget && originalTarget && !originalTarget.hostPort;
    if (needsMigration || needsHostPort) {
      if (needsMigration) {
        log.info("Migrated proxyTarget for app", { appId, proxyTarget });
      } else {
        log.info("Assigned hostPort for app", {
          appId,
          hostPort: proxyTarget!.hostPort,
        });
      }
      await writeFile(
        metaPath,
        JSON.stringify({ ...meta, proxyTarget }),
        "utf-8",
      );
    }

    // Fix volume directory permissions on every startup
    await this.fixVolumePermissions(appDir);

    const app = new App(
      {
        id: appId,
        name: meta.name,
        version: meta.version,
        port: meta.port,
        installedAt: meta.installedAt,
        dataDir: appDir,
        status: "stopped",
        proxyTarget,
        type: meta.type ?? "store",
      },
      this.docker,
    );

    this.instances.set(appId, app);
    await app.syncStatus();
  }

  async install(appId: string): Promise<AppInstance> {
    if (this.instances.has(appId)) {
      throw new Error(`App already installed: ${appId}`);
    }

    const manifest = this.appStore.getApp(appId);
    if (!manifest) {
      throw new Error(`App not found in store: ${appId}`);
    }

    const sourceDir = await this.appStore.getRepoDir(appId);
    if (!sourceDir) {
      throw new Error(`App source not found: ${appId}`);
    }

    // Free disk space by removing unused Docker images (non-blocking)
    this.docker.pruneUnused().catch(() => {});

    const appDir = this.safeAppDir(appId);
    await mkdir(appDir, { recursive: true });

    try {
      await cp(sourceDir, appDir, { recursive: true });
      const { proxyTarget: rawTarget, composeContent } =
        await this.patchComposeFile(appDir);

      const proxyTarget = rawTarget
        ? this.assignHostPort(rawTarget)
        : undefined;

      const app = new App(
        {
          id: appId,
          name: manifest.name,
          version: manifest.version,
          port: manifest.port,
          installedAt: new Date().toISOString(),
          dataDir: appDir,
          status: "installing",
          proxyTarget,
        },
        this.docker,
      );
      this.instances.set(appId, app);
      if (proxyTarget?.hostPort) {
        this.pendingPorts.delete(proxyTarget.hostPort);
      }

      const composePath = path.join(appDir, "docker-compose.yml");
      await this.validateComposeFile(composePath);
      if (composeContent) {
        await this.prepareVolumeDirectories(appDir, composeContent);
      }
      await this.writeAppMeta(app);
      await app.start();
      await this.updateInstalledList();

      if (proxyTarget) {
        await this.proxy.addApp(appId, proxyTarget);
      }

      log.info("App installed", { appId, proxyTarget });
      return app.toJSON();
    } catch (err) {
      log.error("App install failed", { appId, error: String(err) });
      const failedApp = this.instances.get(appId);
      if (failedApp?.proxyTarget?.hostPort) {
        this.pendingPorts.delete(failedApp.proxyTarget.hostPort);
      }
      this.instances.delete(appId);
      await rm(appDir, { recursive: true, force: true });
      throw new Error(`Failed to install ${appId}: ${String(err)}`);
    }
  }

  async uninstall(appId: string): Promise<void> {
    const app = this.getApp(appId);

    try {
      await app.stop();
    } catch {
      log.warn("Failed to stop app during uninstall", { appId });
    }

    await this.proxy.removeApp(appId);

    const appDir = this.safeAppDir(appId);
    await rm(appDir, { recursive: true, force: true });
    this.instances.delete(appId);
    await this.updateInstalledList();
    log.info("App uninstalled", { appId });
  }

  async start(appId: string): Promise<void> {
    const app = this.getApp(appId);
    await app.start();
  }

  async stop(appId: string): Promise<void> {
    const app = this.getApp(appId);
    await app.stop();
  }

  async restart(appId: string): Promise<void> {
    const app = this.getApp(appId);
    await app.restart();
  }

  getStatus(appId: string): AppStatus {
    const app = this.getApp(appId);
    return app.getStatus();
  }

  listInstalled(): AppInstance[] {
    return [...this.instances.values()].map((app) => app.toJSON());
  }

  listExternal(): ExternalApp[] {
    return this.store.get().apps.external;
  }

  async installCustom(input: {
    name: string;
    image?: string;
    composeYaml?: string;
    containerPort: number;
    icon?: string;
  }): Promise<AppInstance> {
    const id = slugify(input.name);
    if (!id) throw new Error("Invalid app name");
    if (this.instances.has(id)) {
      throw new Error(`App ID already in use: ${id}`);
    }

    const appDir = this.safeAppDir(id);
    await mkdir(appDir, { recursive: true });

    try {
      const composePath = path.join(appDir, "docker-compose.yml");
      let composeContent: string;

      if (input.composeYaml) {
        composeContent = input.composeYaml;
      } else if (input.image) {
        composeContent = yaml.dump({
          services: {
            app: {
              image: input.image,
              restart: "unless-stopped",
            },
          },
        }, { lineWidth: -1, noRefs: true });
      } else {
        throw new Error("Provide image or compose YAML");
      }

      await writeFile(composePath, composeContent, "utf-8");

      // Patch compose (add network, .env)
      const { composeContent: patchedContent } =
        await this.patchComposeFile(appDir);
      await this.validateComposeFile(composePath);

      const rawTarget: ProxyTarget = { service: "app", port: input.containerPort };
      const proxyTarget = this.assignHostPort(rawTarget);

      const app = new App(
        {
          id,
          name: input.name,
          version: "custom",
          installedAt: new Date().toISOString(),
          dataDir: appDir,
          status: "installing",
          proxyTarget,
          type: "custom",
        },
        this.docker,
      );

      this.instances.set(id, app);
      if (proxyTarget.hostPort) {
        this.pendingPorts.delete(proxyTarget.hostPort);
      }

      if (patchedContent) {
        await this.prepareVolumeDirectories(appDir, patchedContent);
      }
      await this.writeAppMeta(app);
      await app.start();
      await this.updateInstalledList();

      if (proxyTarget) {
        await this.proxy.addApp(id, proxyTarget);
      }

      log.info("Custom app installed", { id, image: input.image });
      return app.toJSON();
    } catch (err) {
      log.error("Custom app install failed", { id, error: String(err) });
      const failedApp = this.instances.get(id);
      if (failedApp?.proxyTarget?.hostPort) {
        this.pendingPorts.delete(failedApp.proxyTarget.hostPort);
      }
      this.instances.delete(id);
      await rm(appDir, { recursive: true, force: true });
      throw new Error(`Failed to install custom app ${id}: ${String(err)}`);
    }
  }

  async addExternal(input: { name: string; url: string; icon?: string }): Promise<ExternalApp> {
    const id = slugify(input.name);
    if (!id) throw new Error("Invalid app name");
    // Enforce cross-type uniqueness: external IDs must not collide with Docker apps
    if (this.instances.has(id)) {
      throw new Error(`App ID already in use: ${id}`);
    }

    const config = this.store.get();
    if (config.apps.external.some((e) => e.id === id)) {
      throw new Error(`External app already exists: ${id}`);
    }

    const entry: ExternalApp = {
      id,
      name: input.name,
      url: input.url,
      icon: input.icon,
      addedAt: new Date().toISOString(),
    };

    await this.store.update({
      apps: {
        ...config.apps,
        external: [...config.apps.external, entry],
      },
    });

    log.info("External app added", { id, url: input.url });
    return entry;
  }

  async removeExternal(id: string): Promise<void> {
    const config = this.store.get();
    const filtered = config.apps.external.filter((e) => e.id !== id);
    if (filtered.length === config.apps.external.length) {
      throw new Error(`External app not found: ${id}`);
    }

    await this.store.update({
      apps: { ...config.apps, external: filtered },
    });
    log.info("External app removed", { id });
  }

  async updateExternal(
    id: string,
    input: { name?: string; url?: string; icon?: string },
  ): Promise<ExternalApp> {
    const config = this.store.get();
    const index = config.apps.external.findIndex((e) => e.id === id);
    if (index === -1) {
      throw new Error(`External app not found: ${id}`);
    }

    const updated: ExternalApp = {
      ...config.apps.external[index],
      ...(input.name !== undefined && { name: input.name }),
      ...(input.url !== undefined && { url: input.url }),
      ...(input.icon !== undefined && { icon: input.icon }),
    };

    const external = [
      ...config.apps.external.slice(0, index),
      updated,
      ...config.apps.external.slice(index + 1),
    ];

    await this.store.update({
      apps: { ...config.apps, external },
    });

    log.info("External app updated", { id });
    return updated;
  }

  async update(appId: string): Promise<void> {
    const app = this.getApp(appId);
    const manifest = this.appStore.getApp(appId);
    if (!manifest) {
      throw new Error(`App not found in store: ${appId}`);
    }

    const sourceDir = await this.appStore.getRepoDir(appId);
    if (!sourceDir) {
      throw new Error(`App source not found: ${appId}`);
    }

    await app.stop();

    await cp(sourceDir, app.dataDir, { recursive: true });
    const { proxyTarget } = await this.patchComposeFile(app.dataDir);

    const composePath = path.join(app.dataDir, "docker-compose.yml");
    await this.validateComposeFile(composePath);

    const baseTarget = proxyTarget ?? app.proxyTarget;
    const effectiveProxyTarget = baseTarget
      ? this.assignHostPort(baseTarget, app.proxyTarget)
      : undefined;
    const updatedApp = new App(
      {
        id: appId,
        name: app.name,
        version: app.version,
        port: app.port,
        installedAt: app.installedAt,
        dataDir: app.dataDir,
        proxyTarget: effectiveProxyTarget,
      },
      this.docker,
    );
    this.instances.set(appId, updatedApp);
    if (effectiveProxyTarget?.hostPort) {
      this.pendingPorts.delete(effectiveProxyTarget.hostPort);
    }
    await this.writeAppMeta(updatedApp);
    await updatedApp.start();

    if (effectiveProxyTarget) {
      await this.proxy.addApp(appId, effectiveProxyTarget);
    }

    log.info("App updated", { appId });
  }

  private getApp(appId: string): App {
    const app = this.instances.get(appId);
    if (!app) {
      throw new Error(`App not installed: ${appId}`);
    }
    return app;
  }

  private allocateHostPort(): number {
    const usedPorts = new Set(
      [...this.instances.values()]
        .map((app) => app.proxyTarget?.hostPort)
        .filter((p): p is number => p !== undefined),
    );
    let port = APP_PORT_MIN;
    while (usedPorts.has(port) || this.pendingPorts.has(port)) {
      port++;
    }
    if (port > APP_PORT_MAX) {
      throw new Error(
        `App port range exhausted (${APP_PORT_MIN}–${APP_PORT_MAX})`,
      );
    }
    this.pendingPorts.add(port);
    return port;
  }

  /** Return a ProxyTarget with hostPort allocated. Immutable — returns a new object if changed. */
  private assignHostPort(
    target: ProxyTarget,
    existing?: ProxyTarget,
  ): ProxyTarget {
    if (target.hostPort) return target;
    return {
      ...target,
      hostPort: existing?.hostPort ?? this.allocateHostPort(),
    };
  }

  private extractProxyTarget(content: string): ProxyTarget | undefined {
    // Scope to app_proxy block to avoid matching other services
    const blockMatch = content.match(
      /^ {2}app_proxy:\n((?:\x20{4}[^\n]*\n|\s*\n)*)/m,
    );
    if (!blockMatch) return undefined;
    const block = blockMatch[1];

    // Match both env-style (APP_HOST=val) and YAML-style (APP_HOST: val)
    const hostMatch = block.match(/APP_HOST[=:]\s*([^\s\n]+)/);
    const portMatch = block.match(/APP_PORT[=:]\s*(\d+)/);
    if (!hostMatch || !portMatch) return undefined;

    // APP_HOST is like "{appId}_{serviceName}_1" — extract the service name
    const hostParts = hostMatch[1].split("_");
    if (hostParts.length < 3) {
      log.warn("APP_HOST format not recognised, skipping proxy", {
        host: hostMatch[1],
      });
      return undefined;
    }

    const service = hostParts.slice(1, -1).join("_");
    return { service, port: parseInt(portMatch[1], 10) };
  }

  private async migrateProxyTarget(
    appId: string,
  ): Promise<ProxyTarget | undefined> {
    const sourceDir = await this.appStore.getRepoDir(appId);
    if (!sourceDir) return undefined;

    try {
      const content = await readFile(
        path.join(sourceDir, "docker-compose.yml"),
        "utf-8",
      );
      return this.extractProxyTarget(content);
    } catch {
      return undefined;
    }
  }

  private async patchComposeFile(
    appDir: string,
  ): Promise<{ proxyTarget?: ProxyTarget; composeContent?: string }> {
    const composePath = path.join(appDir, "docker-compose.yml");

    let content: string;
    try {
      content = await readFile(composePath, "utf-8");
    } catch {
      return {};
    }

    // Extract proxy target BEFORE removing app_proxy
    const proxyTarget = this.extractProxyTarget(content);

    // Write APP_PASSWORD to a .env file instead of embedding in compose
    const password = crypto.randomBytes(16).toString("hex");
    const envPath = path.join(appDir, ".env");
    await writeFile(
      envPath,
      `APP_DATA_DIR=${appDir}\nAPP_PASSWORD=${password}\n`,
      { mode: 0o600 },
    );

    if (!content.includes("APP_DATA_DIR")) {
      content = content.replace(
        /environment:/,
        `environment:\n      - APP_DATA_DIR=\${APP_DATA_DIR}\n      - APP_PASSWORD=\${APP_PASSWORD}`,
      );
    }

    // Remove Umbrel's app_proxy service (Tomo doesn't use it)
    content = content.replace(
      /^ {2}app_proxy:\n(?:\x20{4}[^\n]*\n|\s*\n)*/m,
      "",
    );

    if (!content.includes(DOCKER_NETWORK_NAME)) {
      // Parse, inject network into each service, and re-serialize
      const doc = yaml.load(content);
      if (doc && typeof doc === "object") {
        const root = doc as Record<string, unknown>;
        const rawServices = root.services;
        if (rawServices && typeof rawServices === "object" && !Array.isArray(rawServices)) {
          const services = rawServices as Record<string, Record<string, unknown>>;
          for (const svc of Object.values(services)) {
            const existing = svc.networks;
            if (Array.isArray(existing)) {
              if (!existing.includes(DOCKER_NETWORK_NAME)) {
                svc.networks = [...existing, DOCKER_NETWORK_NAME];
              }
            } else if (existing && typeof existing === "object") {
              // Map form: { net: { aliases: [...] } }
              const map = existing as Record<string, unknown>;
              if (!(DOCKER_NETWORK_NAME in map)) {
                svc.networks = { ...map, [DOCKER_NETWORK_NAME]: {} };
              }
            } else {
              svc.networks = [DOCKER_NETWORK_NAME];
            }
          }
        }
        const existingNetworks = (root.networks ?? {}) as Record<string, unknown>;
        root.networks = {
          ...existingNetworks,
          [DOCKER_NETWORK_NAME]: { external: true },
        };
        content = yaml.dump(root, { lineWidth: -1, noRefs: true });
      }
    }

    await writeFile(composePath, content, "utf-8");
    return { proxyTarget, composeContent: content };
  }

  /**
   * Create volume-mounted directories with correct ownership.
   *
   * Many container images run as a non-root user (e.g. uid 1000).  Docker
   * auto-creates host directories as root when they don't exist, which causes
   * EACCES errors inside the container.  This method parses the compose content
   * for volumes that reference `${APP_DATA_DIR}` and creates the host-side
   * directories owned by the container user.
   *
   * Detects uid/gid from (in priority order):
   * 1. `user: "uid:gid"` directive in compose
   * 2. `PUID`/`PGID` environment variables
   * 3. Defaults to 1000:1000
   */
  private async prepareVolumeDirectories(
    appDir: string,
    content: string,
  ): Promise<void> {
    const { uid, gid } = this.extractContainerUser(content);

    // Match volume source paths like ${APP_DATA_DIR}/data or $APP_DATA_DIR/data
    const matches = content.matchAll(/\$\{?APP_DATA_DIR\}?\/([^\s:]+)/g);
    const subdirs = new Set(Array.from(matches, (m) => m[1]));

    await Promise.all(
      Array.from(subdirs).map(async (subdir) => {
        const fullPath = path.join(appDir, subdir);
        await mkdir(fullPath, { recursive: true });
        await this.chownRecursive(fullPath, uid, gid);
      }),
    );
  }

  private extractContainerUser(content: string): { uid: number; gid: number } {
    // Check user: "uid:gid" directive first
    const userMatch = /^\s+user:\s*["']?(\d+):(\d+)["']?/m.exec(content);
    if (userMatch) {
      return { uid: parseInt(userMatch[1], 10), gid: parseInt(userMatch[2], 10) };
    }

    // Fall back to PUID/PGID env vars
    const uid = this.extractEnvInt(content, "PUID") ?? 1000;
    const gid = this.extractEnvInt(content, "PGID") ?? 1000;
    return { uid, gid };
  }

  private extractEnvInt(content: string, name: string): number | undefined {
    // Match both YAML-style (NAME: value) and env-style (NAME=value)
    const re = new RegExp(`${name}[=:]\\s*(?:['"]?)(\\d+)(?:['"]?)`, "m");
    const m = re.exec(content);
    return m ? parseInt(m[1], 10) : undefined;
  }

  private async chownRecursive(
    dirPath: string,
    uid: number,
    gid: number,
  ): Promise<void> {
    await chown(dirPath, uid, gid);
    const entries = await readdir(dirPath, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          await this.chownRecursive(fullPath, uid, gid);
        } else {
          await chown(fullPath, uid, gid);
        }
      }),
    );
  }

  private async fixVolumePermissions(appDir: string): Promise<void> {
    const composePath = path.join(appDir, "docker-compose.yml");
    try {
      const content = await readFile(composePath, "utf-8");
      await this.prepareVolumeDirectories(appDir, content);
    } catch {
      // Compose file may not exist yet
    }
  }

  private async writeAppMeta(app: App): Promise<void> {
    const metaPath = path.join(app.dataDir, "tomo-meta.json");
    const meta: AppMeta = {
      name: app.name,
      version: app.version,
      port: app.port,
      installedAt: app.installedAt,
      proxyTarget: app.proxyTarget,
      type: app.type,
    };
    await writeFile(metaPath, JSON.stringify(meta), "utf-8");
  }

  private async updateInstalledList(): Promise<void> {
    const config = this.store.get();
    await this.store.update({
      apps: {
        ...config.apps,
        installed: [...this.instances.keys()],
      },
    });
  }
}

interface AppMeta {
  name: string;
  version: string;
  port?: number;
  installedAt: string;
  proxyTarget?: ProxyTarget;
  type?: AppType;
}
