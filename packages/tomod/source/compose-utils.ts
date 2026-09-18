import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import yaml from "js-yaml";
import { createLogger } from "./logger.js";
import { DOCKER_NETWORK_NAME } from "./config.js";
import type { ProxyTarget } from "./app.js";

const log = createLogger("compose");

const FORBIDDEN_PATTERNS = [
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

export async function validateComposeFile(
  composePath: string,
  options: { allowPrivileged?: boolean } = {},
): Promise<void> {
  if (options.allowPrivileged) {
    log.warn("Compose validation bypassed (allowPrivileged)", { composePath });
    return;
  }

  const content = await readFile(composePath, "utf-8");
  const raw = content.toLowerCase();

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (raw.includes(pattern)) {
      throw new Error(
        `Compose file contains forbidden configuration: ${pattern}`,
      );
    }
  }

  if (/^\s+build:/m.test(raw)) {
    throw new Error(
      "Compose file contains forbidden configuration: build context",
    );
  }
}

export type ComposeService = Record<string, unknown>;
export type ComposeServices = Record<string, ComposeService>;

export type ComposeRoot = Record<string, unknown>;

/** Parse compose YAML into its root mapping. @throws Error("Invalid compose YAML: ...") */
export function loadRoot(content: string): ComposeRoot | undefined {
  let doc: unknown;
  try {
    doc = yaml.load(content);
  } catch (err) {
    throw new Error(`Invalid compose YAML: ${String(err)}`);
  }
  return doc && typeof doc === "object" ? (doc as ComposeRoot) : undefined;
}

/**
 * Extract the `services` map from a parsed compose document, or undefined
 * when there is none. A service with no body (`web:`) parses as null and is
 * normalised to an empty object so callers never see null.
 */
export function servicesOf(root: ComposeRoot | undefined): ComposeServices | undefined {
  const services = root?.services;
  if (!services || typeof services !== "object" || Array.isArray(services)) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(services as Record<string, unknown>).map(([name, svc]) => [
      name,
      svc && typeof svc === "object" ? (svc as ComposeService) : {},
    ]),
  );
}

/** Serialise a compose document the way Tomo writes every compose file. */
export function dumpCompose(root: Record<string, unknown>): string {
  return yaml.dump(root, { lineWidth: -1, noRefs: true });
}

/**
 * Parse compose YAML and return its `services` map, or undefined when the
 * document has none.
 *
 * @throws Error("Invalid compose YAML: ...") when the YAML does not parse.
 */
export function loadServices(content: string): ComposeServices | undefined {
  return servicesOf(loadRoot(content));
}

/** Compose's implicit per-project network, which keeps an app's services private to it. */
const DEFAULT_NETWORK = "default";

const TOMO_ENV_LIST = ["APP_DATA_DIR=${APP_DATA_DIR}", "APP_PASSWORD=${APP_PASSWORD}"];
const TOMO_ENV_MAP = { APP_DATA_DIR: "${APP_DATA_DIR}", APP_PASSWORD: "${APP_PASSWORD}" };

/** True when the service already sits on the Tomo network or cannot join one. */
function isOnTomoNetwork(svc: ComposeService): boolean {
  // docker-compose rejects services that combine network_mode with networks
  if (svc.network_mode) return true;
  const nets = svc.networks;
  if (Array.isArray(nets)) return nets.includes(DOCKER_NETWORK_NAME);
  if (nets && typeof nets === "object") return DOCKER_NETWORK_NAME in nets;
  return false;
}

/**
 * Add the Tomo network to a service. A service that declares no networks
 * would otherwise drop off compose's default network, so that is kept too.
 */
function withTomoNetwork(svc: ComposeService): ComposeService {
  const existing = svc.networks;
  if (Array.isArray(existing)) {
    return { ...svc, networks: [...existing, DOCKER_NETWORK_NAME] };
  }
  if (existing && typeof existing === "object") {
    return { ...svc, networks: { ...existing, [DOCKER_NETWORK_NAME]: {} } };
  }
  return { ...svc, networks: [DEFAULT_NETWORK, DOCKER_NETWORK_NAME] };
}

/**
 * Attach the proxied service to the Tomo network, where Traefik can reach it,
 * and declare that network as external. Every other service stays on the
 * app's own private network, so a `db` in one app can never be confused
 * with a `db` in another.
 *
 * @returns the compose YAML, unchanged when there is nothing to attach
 * @throws Error("Invalid compose YAML: ...") when the YAML does not parse
 */
export function attachTomoNetwork(content: string, proxyService: string | undefined): string {
  if (proxyService === undefined) return content;
  const root = loadRoot(content);
  const services = servicesOf(root);
  const service = services?.[proxyService];
  if (!root || !services || !service || isOnTomoNetwork(service)) return content;

  return dumpCompose({
    ...root,
    services: { ...services, [proxyService]: withTomoNetwork(service) },
    networks: {
      ...((root.networks ?? {}) as Record<string, unknown>),
      [DOCKER_NETWORK_NAME]: { external: true },
    },
  });
}

/**
 * Give the app's service the Tomo variables (APP_DATA_DIR, APP_PASSWORD), in
 * whichever style its environment uses. Without a known proxied service, the
 * first service that declares an environment gets them. Files that already
 * reference APP_DATA_DIR are left alone.
 *
 * @throws Error("Invalid compose YAML: ...") when the YAML does not parse
 */
export function injectTomoEnvironment(content: string, proxyService?: string): string {
  if (content.includes("APP_DATA_DIR")) return content;
  const root = loadRoot(content);
  const services = servicesOf(root);
  const entry =
    services &&
    (proxyService !== undefined && proxyService in services
      ? ([proxyService, services[proxyService]] as const)
      : Object.entries(services).find(([, svc]) => svc.environment !== undefined));
  if (!root || !services || !entry) return content;

  const [name, svc] = entry;
  const env = svc.environment;
  const patched =
    env && typeof env === "object" && !Array.isArray(env)
      ? { ...TOMO_ENV_MAP, ...env }
      : [...TOMO_ENV_LIST, ...(Array.isArray(env) ? env : [])];
  return dumpCompose({ ...root, services: { ...services, [name]: { ...svc, environment: patched } } });
}

export function extractProxyTarget(
  content: string,
): ProxyTarget | undefined {
  const blockMatch = content.match(
    /^ {2}app_proxy:\n((?:\x20{4}[^\n]*\n|\s*\n)*)/m,
  );
  if (!blockMatch) return undefined;
  const block = blockMatch[1];

  const hostMatch = block.match(/APP_HOST[=:]\s*([^\s\n]+)/);
  const portMatch = block.match(/APP_PORT[=:]\s*(\d+)/);
  if (!hostMatch || !portMatch) return undefined;

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

/**
 * Prepare an app's compose file for Tomo: write its .env, inject the Tomo
 * variables, strip any Umbrel app_proxy block, and attach the proxied service
 * to the Tomo network.
 *
 * @param proxyService the service Traefik will dial when the file has no
 *   app_proxy block naming one: the resolved service for custom and template
 *   apps, or the previously known service when a store app is updated
 */
export async function patchComposeFile(
  appDir: string,
  proxyService?: string,
): Promise<{ proxyTarget?: ProxyTarget; composeContent?: string }> {
  const composePath = path.join(appDir, "docker-compose.yml");

  let content: string;
  try {
    content = await readFile(composePath, "utf-8");
  } catch {
    return {};
  }

  const proxyTarget = extractProxyTarget(content);

  const password = crypto.randomBytes(16).toString("hex");
  const envPath = path.join(appDir, ".env");
  await writeFile(
    envPath,
    `APP_DATA_DIR=${appDir}\nAPP_PASSWORD=${password}\n`,
    { mode: 0o600 },
  );

  content = content.replace(
    /^ {2}app_proxy:\n(?:\x20{4}[^\n]*\n|\s*\n)*/m,
    "",
  );
  const appService = proxyTarget?.service ?? proxyService;
  content = injectTomoEnvironment(content, appService);
  content = attachTomoNetwork(content, appService);

  await writeFile(composePath, content, "utf-8");
  return { proxyTarget, composeContent: content };
}
