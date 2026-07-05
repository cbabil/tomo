import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import yaml from "js-yaml";
import { z } from "zod";
import { createLogger } from "./logger.js";
import { TOMO_DATA_DIR } from "./config.js";

const log = createLogger("store");

const RepoSchema = z.object({
  url: z.string().url(),
  branch: z.string().default("master"),
});

const ExternalAppSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(64),
  url: z.string().url(),
  icon: z.string().optional(),
  addedAt: z.string(),
});

export type ExternalApp = z.infer<typeof ExternalAppSchema>;

const AppsSchema = z.object({
  installed: z.array(z.string()).default([]),
  repos: z.array(RepoSchema).default([]),
  external: z.array(ExternalAppSchema).default([]),
});

const SettingsSchema = z.object({
  language: z.string().default("en"),
  wallpaper: z.string().default("default"),
  widgets: z.array(z.string()).default([]),
  defaultsSeeded: z.boolean().default(false),
});

const ConfigSchema = z.object({
  version: z.literal(1),
  apps: AppsSchema.default({}),
  settings: SettingsSchema.default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
export type RepoConfig = z.infer<typeof RepoSchema>;

// Derived from the schema's own defaults so new fields need only be declared once.
const defaultConfig = (): Config => ConfigSchema.parse({ version: 1 });

export class Store {
  private readonly filePath: string;
  private config: Config;

  constructor(dataDir?: string) {
    const dir = dataDir ?? TOMO_DATA_DIR;
    this.filePath = path.join(dir, "tomo.yaml");
    this.config = defaultConfig();
  }

  async load(): Promise<void> {
    try {
      const content = await readFile(this.filePath, "utf-8");
      const parsed = yaml.load(content, { schema: yaml.JSON_SCHEMA });
      this.config = ConfigSchema.parse(parsed);
      log.info("Configuration loaded", { path: this.filePath });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        log.info("No config file found, creating default");
        await this.save();
      } else {
        throw err;
      }
    }
  }

  get(): Config {
    return { ...this.config };
  }

  set(config: Config): void {
    this.config = ConfigSchema.parse(config);
  }

  async update(partial: Partial<Config>): Promise<void> {
    this.config = ConfigSchema.parse({ ...this.config, ...partial });
    await this.save();
  }

  async save(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await mkdir(dir, { recursive: true });

    const tmpPath = path.join(
      path.dirname(this.filePath),
      `.tomo-${crypto.randomBytes(16).toString("hex")}.tmp`,
    );
    const content = yaml.dump(this.config, { sortKeys: true });

    await writeFile(tmpPath, content, { encoding: "utf-8", mode: 0o600 });
    await rename(tmpPath, this.filePath);
    log.info("Configuration saved", { path: this.filePath });
  }
}
