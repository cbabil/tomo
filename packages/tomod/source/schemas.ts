/** Input shapes shared by the tRPC API and the MCP tools, so both validate alike. */
import { z } from "zod";
import { MAX_OPEN_PATH_LENGTH } from "./open-path.js";

export const MAX_COMPOSE_YAML_LENGTH = 32_000;

export const appIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "Invalid app ID format");

export const httpUrlSchema = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), "Only http and https URLs are allowed");

/** Shape only; the rules live in normalizeOpenPath, applied by Apps. */
export const openPathSchema = z.string().max(MAX_OPEN_PATH_LENGTH);

export const containerPortSchema = z.number().int().min(1).max(65535);

export const customSourceSchema = z
  .object({
    image: z.string().optional(),
    composeYaml: z.string().max(MAX_COMPOSE_YAML_LENGTH).optional(),
    containerPort: containerPortSchema,
    allowPrivileged: z.boolean().optional(),
  })
  .refine((d) => d.image || d.composeYaml, "Provide image or compose YAML");

/** True when a custom-app request turns on privileged mode or own sign-in. */
export function widensReach(args: Record<string, unknown>): boolean {
  const source = args.source as Record<string, unknown> | undefined;
  return Boolean(args.ownAuth || args.allowPrivileged || source?.allowPrivileged);
}
