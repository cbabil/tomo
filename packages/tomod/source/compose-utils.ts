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

type ComposeRoot = Record<string, unknown>;

/** Parse compose YAML into its root mapping. @throws Error("Invalid compose YAML: ...") */
function loadRoot(content: string): ComposeRoot | undefined {
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
function servicesOf(root: ComposeRoot | undefined): ComposeServices | undefined {
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

/** True when the service already sits on the Tomo network or cannot join one. */
function isOnTomoNetwork(svc: ComposeService): boolean {
  // docker-compose rejects services that combine network_mode with networks
  if (svc.network_mode) return true;
  const nets = svc.networks;
  if (Array.isArray(nets)) return nets.includes(DOCKER_NETWORK_NAME);
  if (nets && typeof nets === "object") return DOCKER_NETWORK_NAME in nets;
  return false;
}

function withTomoNetwork(svc: ComposeService): ComposeService {
  const existing = svc.networks;
  if (Array.isArray(existing)) {
    return { ...svc, networks: [...existing, DOCKER_NETWORK_NAME] };
  }
  if (existing && typeof existing === "object") {
    return { ...svc, networks: { ...existing, [DOCKER_NETWORK_NAME]: {} } };
  }
  return { ...svc, networks: [DOCKER_NETWORK_NAME] };
}

/**
 * Attach every service to the Tomo network and declare it as external.
 * Returns the content unchanged when there is nothing to attach.
 *
 * @throws Error("Invalid compose YAML: ...") when the YAML does not parse.
 */
export function attachTomoNetwork(content: string): string {
  const root = loadRoot(content);
  const services = servicesOf(root);
  if (!root || !services) return content;
  if (Object.values(services).every(isOnTomoNetwork)) return content;

  const patched: ComposeRoot = {
    ...root,
    services: Object.fromEntries(
      Object.entries(services).map(([name, svc]) => [
        name,
        isOnTomoNetwork(svc) ? svc : withTomoNetwork(svc),
      ]),
    ),
    networks: {
      ...((root.networks ?? {}) as Record<string, unknown>),
      [DOCKER_NETWORK_NAME]: { external: true },
    },
  };
  return dumpCompose(patched);
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

export async function patchComposeFile(
  appDir: string,
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

  if (!content.includes("APP_DATA_DIR")) {
    content = content.replace(
      /environment:/,
      `environment:\n      - APP_DATA_DIR=\${APP_DATA_DIR}\n      - APP_PASSWORD=\${APP_PASSWORD}`,
    );
  }

  content = content.replace(
    /^ {2}app_proxy:\n(?:\x20{4}[^\n]*\n|\s*\n)*/m,
    "",
  );

  content = attachTomoNetwork(content);

  await writeFile(composePath, content, "utf-8");
  return { proxyTarget, composeContent: content };
}
