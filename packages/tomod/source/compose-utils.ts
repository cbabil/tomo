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

  if (!content.includes(DOCKER_NETWORK_NAME)) {
    const doc = yaml.load(content);
    if (doc && typeof doc === "object") {
      const root = doc as Record<string, unknown>;
      const rawServices = root.services;
      if (
        rawServices &&
        typeof rawServices === "object" &&
        !Array.isArray(rawServices)
      ) {
        const services = rawServices as Record<
          string,
          Record<string, unknown>
        >;
        for (const svc of Object.values(services)) {
          const existing = svc.networks;
          if (Array.isArray(existing)) {
            if (!existing.includes(DOCKER_NETWORK_NAME)) {
              svc.networks = [...existing, DOCKER_NETWORK_NAME];
            }
          } else if (existing && typeof existing === "object") {
            const map = existing as Record<string, unknown>;
            if (!(DOCKER_NETWORK_NAME in map)) {
              svc.networks = { ...map, [DOCKER_NETWORK_NAME]: {} };
            }
          } else {
            svc.networks = [DOCKER_NETWORK_NAME];
          }
        }
      }
      const existingNetworks = (root.networks ?? {}) as Record<
        string,
        unknown
      >;
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
