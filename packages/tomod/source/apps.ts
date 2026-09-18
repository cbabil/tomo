import { readFile, writeFile, mkdir, rm, cp } from "node:fs/promises";
import path from "node:path";
import { createLogger } from "./logger.js";
import { TOMO_DATA_DIR } from "./config.js";
import {
  App,
  type AppInstance,
  type AppStatus,
  type AppType,
  type CustomSource,
  type ProxyTarget,
} from "./app.js";
import { slugify } from "./utils.js";
import { patchComposeFile, validateComposeFile, extractProxyTarget, dumpCompose } from "./compose-utils.js";
import { resolveProxyTarget, unpublishProxiedPort, DEFAULT_SERVICE } from "./custom-compose.js";
import { normalizeOpenPath } from "./open-path.js";
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

// Template pre-installed on a fresh setup (see seedDefaults).
export const DEFAULT_TEMPLATE_ID = "terminal";

// System apps are managed by Tomo itself (e.g. the Terminal powering the dock
// modal) and hidden from the desktop grid, App Store, and search.
export const SYSTEM_APP_IDS = new Set<string>([DEFAULT_TEMPLATE_ID]);

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
        path: meta.path,
        icon: meta.icon,
        templateId: meta.templateId,
        source: meta.source,
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

  /** The compose file for a custom app: the user's YAML, or one generated from an image. */
  private buildCustomCompose(source: CustomSource): string {
    if (source.composeYaml) return source.composeYaml;
    if (source.image) {
      return dumpCompose({
        services: { [DEFAULT_SERVICE]: { image: source.image, restart: "unless-stopped" } },
      });
    }
    throw new Error("Provide image or compose YAML");
  }

  /**
   * Write a custom app's compose file and prepare it for Tomo. The proxied
   * port's host mapping is removed so the app is only reachable through the
   * proxy, and the app's services are attached to the Tomo network.
   */
  private async writeCustomCompose(
    appDir: string,
    source: CustomSource,
    target: ProxyTarget,
  ): Promise<string | undefined> {
    const composeContent = unpublishProxiedPort(this.buildCustomCompose(source), target);
    await writeFile(path.join(appDir, "docker-compose.yml"), composeContent, "utf-8");
    const { composeContent: patchedContent } = await patchComposeFile(appDir, target.service);
    await validateComposeFile(path.join(appDir, "docker-compose.yml"), {
      allowPrivileged: source.allowPrivileged,
    });
    return patchedContent;
  }

  async installCustom(input: {
    name: string;
    image?: string;
    composeYaml?: string;
    containerPort: number;
    path?: string;
    icon?: string;
    allowPrivileged?: boolean;
    ownAuth?: boolean;
  }): Promise<AppInstance> {
    const id = slugify(input.name);
    const openPath = normalizeOpenPath(input.path ?? "");
    if (!id) throw new Error("Invalid app name");
    if (this.instances.has(id)) throw new Error(`App ID already in use: ${id}`);
    const source: CustomSource = {
      image: input.image,
      composeYaml: input.composeYaml,
      containerPort: input.containerPort,
      allowPrivileged: input.allowPrivileged,
    };

    const appDir = this.safeAppDir(id);
    await mkdir(appDir, { recursive: true });

    return this.withInstallRollback(id, appDir, async () => {
      const target = resolveProxyTarget(this.buildCustomCompose(source), input.containerPort, id);
      const patchedContent = await this.writeCustomCompose(appDir, source, target);

      return this.finishInstall({
        id,
        name: input.name,
        version: "custom",
        appDir,
        type: "custom",
        path: openPath,
        icon: input.icon,
        source,
        proxyTarget: this.portAllocator.assign({ ...target, ownAuth: input.ownAuth || undefined }),
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
      const target = resolveProxyTarget(composeContent, template.containerPort, id);
      await writeFile(path.join(appDir, "docker-compose.yml"), composeContent, "utf-8");
      const { composeContent: patchedContent } = await patchComposeFile(appDir, target.service);

      await this.appendEnvFile(path.join(appDir, ".env"), {
        ...template.environment,
        ...setupValues,
      });
      await validateComposeFile(path.join(appDir, "docker-compose.yml"), {
        allowPrivileged: template.allowPrivileged,
      });

      return this.finishInstall({
        id,
        name: template.name,
        version: "latest",
        appDir,
        type: "template",
        templateId: input.templateId,
        path: normalizeOpenPath(template.path ?? ""),
        icon: template.icon || undefined,
        proxyTarget: this.portAllocator.assign(target),
        patchedContent,
      });
    });
  }

  /**
   * Install the default apps that ship pre-installed on a fresh setup.
   * Runs once: the `defaultsSeeded` flag guards against re-installing an app
   * the user later removes. Failures are non-fatal and retried on next start.
   */
  async seedDefaults(): Promise<void> {
    const { settings } = this.store.get();
    if (settings.defaultsSeeded) return;

    const template = this.templateRegistry.get(DEFAULT_TEMPLATE_ID);
    if (!template) {
      log.warn("Default template not found; skipping seed", {
        templateId: DEFAULT_TEMPLATE_ID,
      });
      return;
    }

    if (this.instances.has(slugify(template.name))) {
      await this.markDefaultsSeeded();
      return;
    }

    try {
      await this.installTemplate({ templateId: DEFAULT_TEMPLATE_ID });
      await this.markDefaultsSeeded();
      log.info("Seeded default app", { templateId: DEFAULT_TEMPLATE_ID });
    } catch (err) {
      log.warn("Failed to seed default app; will retry on next start", {
        templateId: DEFAULT_TEMPLATE_ID,
        error: String(err),
      });
    }
  }

  private async markDefaultsSeeded(): Promise<void> {
    const { settings } = this.store.get();
    await this.store.update({ settings: { ...settings, defaultsSeeded: true } });
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

  async getLogs(appId: string, tail: number = 200): Promise<string> {
    return this.getApp(appId).getLogs(tail);
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

  /**
   * Edit a custom or template app: where it opens, its icon, whether it
   * handles its own sign-in, and, for custom apps, the image or compose YAML
   * it runs. A changed source redeploys the app in place, keeping its data.
   *
   * @throws when the app is not installed, is a store app, the path is
   *   invalid, or a source is given for an app that is not custom
   */
  async updateCustom(
    appId: string,
    input: { path?: string; icon?: string; ownAuth?: boolean; source?: CustomSource },
  ): Promise<AppInstance> {
    const app = this.getApp(appId);
    if (app.type !== "custom" && app.type !== "template") {
      throw new Error("Only custom and template apps can be edited");
    }
    if (input.source && app.type !== "custom") {
      throw new Error("Only custom apps can be redeployed with new settings");
    }

    const presented = app.withChanges({
      path: normalizeOpenPath(input.path ?? ""),
      icon: input.icon || undefined,
    });
    const ownAuth = (input.ownAuth ?? app.proxyTarget?.ownAuth) || undefined;
    const updated = input.source
      ? await this.redeploy(presented, input.source, ownAuth)
      : await this.applyOwnAuth(presented, ownAuth);

    this.instances.set(appId, updated);
    await this.writeAppMeta(updated);
    log.info("App updated by user", { appId, redeployed: Boolean(input.source) });
    return updated.toJSON();
  }

  /** Re-route an app with or without the Tomo login, when that changed. */
  private async applyOwnAuth(app: App, ownAuth: boolean | undefined): Promise<App> {
    if (!app.proxyTarget || app.proxyTarget.ownAuth === ownAuth) return app;
    const proxyTarget = { ...app.proxyTarget, ownAuth };
    await this.proxy.addApp(app.id, proxyTarget);
    return app.withChanges({ proxyTarget });
  }

  /**
   * Replace a custom app's compose file and recreate its containers. The
   * data folder and proxy port are kept. If the new file is rejected or the
   * app fails to start, the previous file is restored and the app restarted.
   */
  private async redeploy(app: App, source: CustomSource, ownAuth: boolean | undefined): Promise<App> {
    const composePath = path.join(app.dataDir, "docker-compose.yml");
    const previousCompose = await readFile(composePath, "utf-8");
    const rawTarget = resolveProxyTarget(this.buildCustomCompose(source), source.containerPort, app.id);
    const proxyTarget = this.portAllocator.assign({ ...rawTarget, ownAuth }, app.proxyTarget);

    await app.stop();
    const next = app.withChanges({ proxyTarget, source });
    try {
      const patchedContent = await this.writeCustomCompose(app.dataDir, source, rawTarget);
      if (patchedContent) await prepareVolumeDirectories(app.dataDir, patchedContent);
      await next.start();
    } catch (err) {
      log.warn("Redeploy failed; restoring the previous compose file", { appId: app.id, error: String(err) });
      await writeFile(composePath, previousCompose, "utf-8");
      await app.start().catch((restartErr: unknown) => {
        log.error("Could not restart app after failed redeploy", { appId: app.id, error: String(restartErr) });
      });
      throw err;
    }
    await this.proxy.addApp(app.id, proxyTarget);
    return next;
  }

  async update(appId: string): Promise<void> {
    const app = this.getApp(appId);
    // Custom and template apps have no store manifest to sync from. Updating
    // them means pulling newer images for the same compose file.
    if (app.type === "custom" || app.type === "template") {
      await app.pullAndRecreate();
      log.info("App updated", { appId, type: app.type });
      return;
    }
    const manifest = this.appStore.getApp(appId);
    if (!manifest) throw new Error(`App not found in store: ${appId}`);

    const sourceDir = await this.appStore.getRepoDir(appId);
    if (!sourceDir) throw new Error(`App source not found: ${appId}`);

    await app.stop();
    await cp(sourceDir, app.dataDir, { recursive: true });

    // Keep routing and network attachment on the same service if the refreshed
    // compose file no longer declares an app_proxy block.
    const { proxyTarget } = await patchComposeFile(app.dataDir, app.proxyTarget?.service);
    await validateComposeFile(path.join(app.dataDir, "docker-compose.yml"));

    const baseTarget = proxyTarget ?? app.proxyTarget;
    const effectiveProxyTarget = baseTarget
      ? this.portAllocator.assign(baseTarget, app.proxyTarget)
      : undefined;

    const updatedApp = app.withChanges({ proxyTarget: effectiveProxyTarget });
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
    path?: string;
    icon?: string;
    source?: CustomSource;
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
        path: params.path,
        icon: params.icon,
        templateId,
        source: params.source,
      },
      this.docker,
    );

    this.instances.set(id, app);
    if (proxyTarget?.hostPort) this.pendingPorts.delete(proxyTarget.hostPort);
    if (patchedContent) await prepareVolumeDirectories(appDir, patchedContent);
    await this.writeAppMeta(app);
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

    return dumpCompose({ services: { [DEFAULT_SERVICE]: service } });
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
      path: app.path,
      icon: app.icon,
      templateId: app.templateId,
      source: app.source,
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
  path?: string;
  icon?: string;
  source?: CustomSource;
}
