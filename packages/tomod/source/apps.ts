import { readFile, writeFile, mkdir, rm, cp } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { createLogger } from "./logger.js";
import { TOMO_DATA_DIR } from "./config.js";
import { App, type AppInstance, type AppStatus, type AppType, type ProxyTarget } from "./app.js";
import { slugify } from "./utils.js";
import { patchComposeFile, validateComposeFile, extractProxyTarget } from "./compose-utils.js";
import { prepareVolumeDirectories, fixVolumePermissions } from "./volume-utils.js";
import { PortAllocator } from "./port-allocator.js";
import { addExternal, removeExternal, updateExternal, listExternal } from "./external-apps.js";
import type { ExternalApp } from "./store.js";
import type { AppStore } from "./app-store.js";
import type { TemplateRegistry, AppTemplate } from "./templates.js";
import type { Docker } from "./docker.js";
import type { TraefikProxy } from "./traefik-proxy.js";
import type { Store } from "./store.js";

const log = createLogger("apps");

export { slugify };

export class Apps {
  private readonly appStore: AppStore;
  private readonly templateRegistry: TemplateRegistry;
  private readonly docker: Docker;
  private readonly store: Store;
  private readonly proxy: TraefikProxy;
  private readonly appsDir: string;
  private readonly instances: Map<string, App> = new Map();
  private readonly pendingPorts: Set<number> = new Set();
  private readonly portAllocator: PortAllocator;

  constructor(
    appStore: AppStore,
    templateRegistry: TemplateRegistry,
    docker: Docker,
    store: Store,
    proxy: TraefikProxy,
  ) {
    this.appStore = appStore;
    this.templateRegistry = templateRegistry;
    this.docker = docker;
    this.store = store;
    this.proxy = proxy;
    this.appsDir = path.join(TOMO_DATA_DIR, "apps");
    this.portAllocator = new PortAllocator(this.instances, this.pendingPorts);
  }

  async init(): Promise<void> {
    await mkdir(this.appsDir, { recursive: true });

    const config = this.store.get();
    for (const appId of config.apps.installed) {
      await this.loadInstalledApp(appId);
    }
    this.pendingPorts.clear();

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

    const originalTarget = meta.proxyTarget;
    const migratedTarget =
      originalTarget ?? (await this.migrateProxyTarget(appId));
    const proxyTarget = migratedTarget
      ? this.portAllocator.assign(migratedTarget)
      : undefined;

    const needsMigration = !originalTarget && proxyTarget;
    const needsHostPort =
      !needsMigration && proxyTarget && originalTarget && !originalTarget.hostPort;
    if (needsMigration || needsHostPort) {
      log.info(needsMigration ? "Migrated proxyTarget" : "Assigned hostPort", {
        appId,
        hostPort: proxyTarget!.hostPort,
      });
      await writeFile(
        metaPath,
        JSON.stringify({ ...meta, proxyTarget }),
        "utf-8",
      );
    }

    await fixVolumePermissions(appDir);

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
    if (!manifest) throw new Error(`App not found in store: ${appId}`);

    const sourceDir = await this.appStore.getRepoDir(appId);
    if (!sourceDir) throw new Error(`App source not found: ${appId}`);

    this.docker.pruneUnused().catch(() => {});

    const appDir = this.safeAppDir(appId);
    await mkdir(appDir, { recursive: true });

    return this.withInstallRollback(appId, appDir, async () => {
      await cp(sourceDir, appDir, { recursive: true });
      const { proxyTarget: rawTarget, composeContent } =
        await patchComposeFile(appDir);

      return this.finishInstall({
        id: appId,
        name: manifest.name,
        version: manifest.version,
        port: manifest.port,
        appDir,
        proxyTarget: rawTarget
          ? this.portAllocator.assign(rawTarget)
          : undefined,
        patchedContent: composeContent,
      });
    });
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
    if (this.instances.has(id)) throw new Error(`App ID already in use: ${id}`);

    const appDir = this.safeAppDir(id);
    await mkdir(appDir, { recursive: true });

    return this.withInstallRollback(id, appDir, async () => {
      let composeContent: string;
      if (input.composeYaml) {
        composeContent = input.composeYaml;
      } else if (input.image) {
        composeContent = yaml.dump(
          { services: { app: { image: input.image, restart: "unless-stopped" } } },
          { lineWidth: -1, noRefs: true },
        );
      } else {
        throw new Error("Provide image or compose YAML");
      }

      await writeFile(path.join(appDir, "docker-compose.yml"), composeContent, "utf-8");
      const { composeContent: patchedContent } = await patchComposeFile(appDir);
      await validateComposeFile(path.join(appDir, "docker-compose.yml"));

      return this.finishInstall({
        id,
        name: input.name,
        version: "custom",
        appDir,
        type: "custom",
        proxyTarget: this.portAllocator.assign({ service: "app", port: input.containerPort }),
        patchedContent,
      });
    });
  }

  async installTemplate(input: {
    templateId: string;
    setupValues?: Record<string, string>;
  }): Promise<AppInstance> {
    const template = this.templateRegistry.get(input.templateId);
    if (!template) throw new Error(`Template not found: ${input.templateId}`);

    const setupValues = this.sanitizeSetupValues(template, input.setupValues);
    const id = slugify(template.name);
    if (!id) throw new Error("Invalid template name");
    if (this.instances.has(id)) throw new Error(`App ID already in use: ${id}`);

    const appDir = this.safeAppDir(id);
    await mkdir(appDir, { recursive: true });

    return this.withInstallRollback(id, appDir, async () => {
      const composeContent = this.buildTemplateCompose(template, setupValues);
      await writeFile(path.join(appDir, "docker-compose.yml"), composeContent, "utf-8");
      const { composeContent: patchedContent } = await patchComposeFile(appDir);

      await this.appendEnvFile(path.join(appDir, ".env"), {
        ...template.environment,
        ...setupValues,
      });
      await validateComposeFile(path.join(appDir, "docker-compose.yml"));

      return this.finishInstall({
        id,
        name: template.name,
        version: "latest",
        appDir,
        type: "template",
        templateId: input.templateId,
        proxyTarget: this.portAllocator.assign({ service: "app", port: template.containerPort }),
        patchedContent,
      });
    });
  }

  async uninstall(appId: string): Promise<void> {
    const app = this.getApp(appId);
    try {
      await app.stop();
    } catch {
      log.warn("Failed to stop app during uninstall", { appId });
    }
    await this.proxy.removeApp(appId);
    await rm(this.safeAppDir(appId), { recursive: true, force: true });
    this.instances.delete(appId);
    await this.updateInstalledList();
    log.info("App uninstalled", { appId });
  }

  async start(appId: string): Promise<void> {
    await this.getApp(appId).start();
  }

  async stop(appId: string): Promise<void> {
    await this.getApp(appId).stop();
  }

  async restart(appId: string): Promise<void> {
    await this.getApp(appId).restart();
  }

  getStatus(appId: string): AppStatus {
    return this.getApp(appId).getStatus();
  }

  listInstalled(): AppInstance[] {
    return [...this.instances.values()].map((app) => app.toJSON());
  }

  listExternal(): ExternalApp[] {
    return listExternal(this.store);
  }

  async addExternal(input: { name: string; url: string; icon?: string }): Promise<ExternalApp> {
    return addExternal(this.store, this.instances, input);
  }

  async removeExternal(id: string): Promise<void> {
    return removeExternal(this.store, id);
  }

  async updateExternal(
    id: string,
    input: { name?: string; url?: string; icon?: string },
  ): Promise<ExternalApp> {
    return updateExternal(this.store, id, input);
  }

  async update(appId: string): Promise<void> {
    const app = this.getApp(appId);
    const manifest = this.appStore.getApp(appId);
    if (!manifest) throw new Error(`App not found in store: ${appId}`);

    const sourceDir = await this.appStore.getRepoDir(appId);
    if (!sourceDir) throw new Error(`App source not found: ${appId}`);

    await app.stop();
    await cp(sourceDir, app.dataDir, { recursive: true });

    const { proxyTarget } = await patchComposeFile(app.dataDir);
    await validateComposeFile(path.join(app.dataDir, "docker-compose.yml"));

    const baseTarget = proxyTarget ?? app.proxyTarget;
    const effectiveProxyTarget = baseTarget
      ? this.portAllocator.assign(baseTarget, app.proxyTarget)
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
    if (effectiveProxyTarget) await this.proxy.addApp(appId, effectiveProxyTarget);

    log.info("App updated", { appId });
  }

  private getApp(appId: string): App {
    const app = this.instances.get(appId);
    if (!app) throw new Error(`App not installed: ${appId}`);
    return app;
  }

  private async finishInstall(params: {
    id: string;
    name: string;
    version: string;
    appDir: string;
    port?: number;
    type?: AppType;
    templateId?: string;
    proxyTarget?: ProxyTarget;
    patchedContent?: string;
  }): Promise<AppInstance> {
    const { id, name, version, appDir, type, templateId, proxyTarget, patchedContent } = params;

    const app = new App(
      {
        id,
        name,
        version,
        port: params.port,
        installedAt: new Date().toISOString(),
        dataDir: appDir,
        status: "installing",
        proxyTarget,
        type,
      },
      this.docker,
    );

    this.instances.set(id, app);
    if (proxyTarget?.hostPort) this.pendingPorts.delete(proxyTarget.hostPort);
    if (patchedContent) await prepareVolumeDirectories(appDir, patchedContent);
    await this.writeAppMeta(app, templateId);
    await app.start();
    await this.updateInstalledList();
    if (proxyTarget) await this.proxy.addApp(id, proxyTarget);

    log.info("App installed", { id, type: type ?? "store" });
    return app.toJSON();
  }

  private async withInstallRollback(
    id: string,
    appDir: string,
    action: () => Promise<AppInstance>,
  ): Promise<AppInstance> {
    try {
      return await action();
    } catch (err) {
      log.error("App install failed", { id, error: String(err) });
      const failedApp = this.instances.get(id);
      if (failedApp?.proxyTarget?.hostPort) {
        this.pendingPorts.delete(failedApp.proxyTarget.hostPort);
      }
      this.instances.delete(id);
      await rm(appDir, { recursive: true, force: true });
      throw new Error(`Failed to install ${id}: ${String(err)}`);
    }
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
      return extractProxyTarget(content);
    } catch {
      return undefined;
    }
  }

  private sanitizeSetupValues(
    template: AppTemplate,
    raw?: Record<string, string>,
  ): Record<string, string> {
    if (!raw || !template.setupFields) return {};
    const allowed = new Set(template.setupFields.map((f) => f.key));
    const fieldTypes = new Map(
      template.setupFields.map((f) => [f.key, f.type]),
    );
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!allowed.has(key)) continue;
      const clean = value.replace(/[\r\n]/g, "");
      if (fieldTypes.get(key) === "path") {
        const resolved = path.resolve(clean);
        if (resolved !== clean || clean.includes("..")) {
          throw new Error(
            `Invalid path for ${key}: must be absolute without '..'`,
          );
        }
      }
      result[key] = clean;
    }
    return result;
  }

  private async appendEnvFile(
    envPath: string,
    vars: Record<string, string>,
  ): Promise<void> {
    const entries = Object.entries(vars);
    if (entries.length === 0) return;
    const lines = entries.map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
    try {
      const existing = await readFile(envPath, "utf-8");
      await writeFile(envPath, existing + lines, { mode: 0o600 });
    } catch {
      await writeFile(envPath, lines, { mode: 0o600 });
    }
  }

  private substituteVars(
    content: string,
    vars: Record<string, string>,
  ): string {
    let result = content;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replaceAll(`\${${key}}`, value);
    }
    return result;
  }

  private buildTemplateCompose(
    template: AppTemplate,
    setupValues?: Record<string, string>,
  ): string {
    const vars = setupValues ?? {};

    if (template.composeYaml) {
      return this.substituteVars(template.composeYaml, vars);
    }

    const envList = Object.entries(template.environment ?? {}).map(
      ([k, v]) => `${k}=${v}`,
    );
    for (const [k, v] of Object.entries(vars)) {
      envList.push(`${k}=${v}`);
    }

    const volumes = (template.volumes ?? []).map((v) =>
      `${this.substituteVars(v.host, vars)}:${v.container}`,
    );

    const service: Record<string, unknown> = {
      image: template.image,
      restart: "unless-stopped",
    };
    if (envList.length > 0) service.environment = envList;
    if (volumes.length > 0) service.volumes = volumes;

    return yaml.dump(
      { services: { app: service } },
      { lineWidth: -1, noRefs: true },
    );
  }

  private async writeAppMeta(app: App, templateId?: string): Promise<void> {
    const metaPath = path.join(app.dataDir, "tomo-meta.json");
    const meta: AppMeta = {
      name: app.name,
      version: app.version,
      port: app.port,
      installedAt: app.installedAt,
      proxyTarget: app.proxyTarget,
      type: app.type,
      ...(templateId && { templateId }),
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
  templateId?: string;
}
