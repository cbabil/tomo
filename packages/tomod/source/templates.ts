import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createLogger } from "./logger.js";

const log = createLogger("templates");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SetupFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "path", "number", "select", "boolean"]),
  default: z.string().optional(),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  options: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .optional(),
  description: z.string().optional(),
});

export const AppTemplateSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1),
  description: z.string(),
  icon: z.string(),
  category: z.string(),
  image: z.string(),
  containerPort: z.number().int().min(1).max(65535),
  composeYaml: z.string().optional(),
  // Trusted built-in templates may opt out of the compose security blocklist
  // (e.g. to mount the Docker socket). Never set on user-provided apps.
  allowPrivileged: z.boolean().optional(),
  setupFields: z.array(SetupFieldSchema).optional(),
  volumes: z
    .array(z.object({ host: z.string(), container: z.string() }))
    .optional(),
  environment: z.record(z.string()).optional(),
});

export type SetupField = z.infer<typeof SetupFieldSchema>;
export type AppTemplate = z.infer<typeof AppTemplateSchema>;

export class TemplateRegistry {
  private templates: Map<string, AppTemplate> = new Map();

  async init(): Promise<void> {
    const filePath = path.join(__dirname, "data", "templates.json");
    try {
      const raw = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw) as unknown[];
      const validated = z.array(AppTemplateSchema).parse(parsed);
      for (const t of validated) {
        this.templates.set(t.id, t);
      }
      log.info("Templates loaded", { count: this.templates.size });
    } catch (err) {
      log.error("Failed to load templates", { error: String(err) });
    }
  }

  list(): AppTemplate[] {
    return [...this.templates.values()];
  }

  get(id: string): AppTemplate | undefined {
    return this.templates.get(id);
  }

  getCategories(): string[] {
    const categories = new Set<string>();
    for (const t of this.templates.values()) {
      categories.add(t.category);
    }
    return [...categories].sort();
  }
}
