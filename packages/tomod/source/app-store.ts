import fs from "node:fs";
import { readdir, readFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import yaml from "js-yaml";
import { z } from "zod";
import { createLogger } from "./logger.js";
import { TOMO_DATA_DIR } from "./config.js";
import type { Store, RepoConfig } from "./store.js";

const log = createLogger("app-store");

export const DEFAULT_REPO_URL = "https://github.com/getumbrel/umbrel-apps";
const DEFAULT_GALLERY_URL =
  "https://raw.githubusercontent.com/getumbrel/umbrel-apps-gallery/master";

const DEFAULT_REPO: RepoConfig = {
  url: DEFAULT_REPO_URL,
  branch: "master",
};

const AppManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  tagline: z.string().default(""),
  description: z.string().default(""),
  category: z.string().default("uncategorized"),
  developer: z.coerce.string().default(""),
  website: z.string().default(""),
  port: z.number().optional(),
  icon: z.string().default(""),
  gallery: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
});

export type AppManifest = z.infer<typeof AppManifestSchema>;

export class AppStore {
  private readonly store: Store;
  private readonly storesDir: string;
  private manifests: Map<string, AppManifest> = new Map();

  constructor(store: Store) {
    this.store = store;
    this.storesDir = path.join(TOMO_DATA_DIR, "app-stores");
  }

  async sync(): Promise<void> {
    const repos = this.getRepos();
    log.info("Syncing app stores", { count: repos.length });

    await Promise.allSettled(repos.map((repo) => this.syncRepo(repo)));

    await this.loadManifests();
    log.info("App store sync complete", { apps: this.manifests.size });
  }

  private getRepos(): RepoConfig[] {
    const config = this.store.get();
    const repos = config.apps.repos;
    if (repos.length === 0) {
      return [DEFAULT_REPO];
    }
    return repos;
  }

  private repoSlug(repo: RepoConfig): string {
    return repo.url
      .replace(/https?:\/\//, "")
      .replace(/[^a-zA-Z0-9]/g, "_");
  }

  private repoDir(repo: RepoConfig): string {
    return path.join(this.storesDir, this.repoSlug(repo));
  }

  private async syncRepo(repo: RepoConfig): Promise<void> {
    const dir = this.repoDir(repo);

    try {
      // Try pull first (avoids TOCTOU race with existsSync)
      await this.pullRepo(dir, repo);
    } catch {
      // Pull failed (repo doesn't exist or is corrupt) — clone fresh
      try {
        await this.cloneRepo(dir, repo);
      } catch (err) {
        log.error("Failed to sync repo", {
          url: repo.url,
          error: String(err),
        });
      }
    }
  }

  private async cloneRepo(
    dir: string,
    repo: RepoConfig,
  ): Promise<void> {
    log.info("Cloning repo", { url: repo.url, branch: repo.branch });
    await mkdir(dir, { recursive: true });

    await git.clone({
      fs,
      http,
      dir,
      url: repo.url,
      ref: repo.branch,
      singleBranch: true,
      depth: 1,
    });
  }

  private async pullRepo(
    dir: string,
    repo: RepoConfig,
  ): Promise<void> {
    log.info("Pulling repo", { url: repo.url });

    await git.pull({
      fs,
      http,
      dir,
      ref: repo.branch,
      singleBranch: true,
      author: { name: "tomo", email: "tomo@local" },
    });
  }

  private async loadManifests(): Promise<void> {
    this.manifests = new Map();
    const repos = this.getRepos();

    for (const repo of repos) {
      const dir = this.repoDir(repo);

      let entries: import("node:fs").Dirent[];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }

      const appDirs = entries.filter(
        (e) => e.isDirectory() && !e.name.startsWith("."),
      );

      const results = await Promise.all(
        appDirs.map(async (entry) => {
          const manifestPath = path.join(dir, entry.name, "umbrel-app.yml");
          try {
            const content = await readFile(manifestPath, "utf-8");
            const parsed = yaml.load(content, { schema: yaml.JSON_SCHEMA });
            const raw = AppManifestSchema.parse(parsed);
            return {
              ...raw,
              icon: `${DEFAULT_GALLERY_URL}/${raw.id}/icon.svg`,
            };
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
              log.warn("Failed to parse manifest", {
                path: manifestPath,
                error: String(err),
              });
            }
            return null;
          }
        }),
      );

      for (const manifest of results) {
        if (manifest) this.manifests.set(manifest.id, manifest);
      }
    }
  }

  listApps(): AppManifest[] {
    return [...this.manifests.values()];
  }

  getApp(appId: string): AppManifest | undefined {
    return this.manifests.get(appId);
  }

  searchApps(query: string): AppManifest[] {
    const lower = query.toLowerCase();
    return this.listApps().filter(
      (app) =>
        app.name.toLowerCase().includes(lower) ||
        app.description.toLowerCase().includes(lower) ||
        app.category.toLowerCase().includes(lower),
    );
  }

  getCategories(): string[] {
    const categories = new Set<string>();
    for (const app of this.manifests.values()) {
      categories.add(app.category);
    }
    return [...categories].sort();
  }

  listRepos(): (RepoConfig & { isDefault: boolean })[] {
    return this.getRepos().map((repo) => ({
      ...repo,
      isDefault: repo.url === DEFAULT_REPO_URL,
    }));
  }

  async addRepo(url: string, branch: string = "master"): Promise<void> {
    const config = this.store.get();
    const exists = config.apps.repos.some((r) => r.url === url);
    if (exists) {
      throw new Error(`Repo already configured: ${url}`);
    }

    await this.store.update({
      apps: {
        ...config.apps,
        repos: [...config.apps.repos, { url, branch }],
      },
    });
    log.info("Repo added", { url, branch });
  }

  async removeRepo(url: string): Promise<void> {
    const config = this.store.get();
    await this.store.update({
      apps: {
        ...config.apps,
        repos: config.apps.repos.filter((r) => r.url !== url),
      },
    });

    const repo = config.apps.repos.find((r) => r.url === url);
    if (repo) {
      const dir = this.repoDir(repo);
      try {
        await rm(dir, { recursive: true, force: true });
      } catch {
        // Directory may not exist — ignore
      }
    }
    log.info("Repo removed", { url });
  }

  async getRepoDir(appId: string): Promise<string | undefined> {
    const repos = this.getRepos();
    for (const repo of repos) {
      const dir = this.repoDir(repo);
      const appDir = path.join(dir, appId);
      try {
        await readdir(appDir);
        return appDir;
      } catch {
        continue;
      }
    }
    return undefined;
  }
}
