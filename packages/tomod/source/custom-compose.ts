/**
 * Resolves which compose service (and which container port) Traefik should
 * proxy for a compose file that has no `app_proxy` block (custom apps and
 * templates).
 *
 * Traefik reaches the app over the internal Docker network, so it needs the
 * container-side port of the chosen service. Users often type the host-side
 * port from their `ports:` mapping, so that is translated when detected.
 */
import { createLogger } from "./logger.js";
import { loadServices, type ComposeService } from "./compose-utils.js";
import type { ProxyTarget } from "./app.js";

const log = createLogger("custom-compose");

/** Service name Tomo generates and prefers when a compose file has several. */
export const DEFAULT_SERVICE = "app";


interface PortMapping {
  host?: number;
  container: number;
}

function parseShortPort(entry: string): PortMapping | undefined {
  const parts = entry.split("/")[0].split(":");
  const container = parseInt(parts[parts.length - 1], 10);
  if (isNaN(container)) return undefined;
  if (parts.length === 1) return { container };
  const host = parseInt(parts[parts.length - 2], 10);
  return { host: isNaN(host) ? undefined : host, container };
}

function parseLongPort(entry: Record<string, unknown>): PortMapping | undefined {
  const container = Number(entry.target);
  if (!Number.isInteger(container)) return undefined;
  const published = Number(entry.published);
  return { host: Number.isInteger(published) ? published : undefined, container };
}

function portMappings(service: ComposeService): PortMapping[] {
  const ports = service.ports;
  if (!Array.isArray(ports)) return [];
  return ports.flatMap((entry) => {
    if (typeof entry === "string" || typeof entry === "number") {
      return parseShortPort(String(entry)) ?? [];
    }
    if (entry && typeof entry === "object") {
      return parseLongPort(entry as Record<string, unknown>) ?? [];
    }
    return [];
  });
}

/**
 * The container port the requested number refers to: itself when a mapping
 * exposes it as a container port, the mapped container port when it matches
 * a host port, undefined when no mapping mentions it.
 */
function matchContainerPort(
  mappings: PortMapping[],
  requestedPort: number,
): number | undefined {
  if (mappings.some((m) => m.container === requestedPort)) return requestedPort;
  return mappings.find((m) => m.host === requestedPort)?.container;
}

function chooseService(
  mappings: Record<string, PortMapping[]>,
  requestedPort: number,
): string {
  const names = Object.keys(mappings);
  if (names.length === 1) return names[0];
  if (DEFAULT_SERVICE in mappings) return DEFAULT_SERVICE;

  const byPort = names.find(
    (n) => matchContainerPort(mappings[n], requestedPort) !== undefined,
  );
  if (byPort) return byPort;

  throw new Error(
    `Compose YAML defines several services (${names.join(", ")}). Name the one to proxy "${DEFAULT_SERVICE}" or map port ${requestedPort} in its "ports"`,
  );
}

/**
 * Pick the service Traefik should proxy and the container port to dial.
 *
 * @throws when the YAML is invalid, has no services, is ambiguous about which
 *   service to proxy, or any service sets `container_name` (Tomo locates
 *   containers by compose's generated names).
 */
export function resolveProxyTarget(
  composeYaml: string,
  requestedPort: number,
): ProxyTarget {
  const services = loadServices(composeYaml);
  if (!services || Object.keys(services).length === 0) {
    throw new Error("Compose YAML must define at least one service");
  }

  const named = Object.entries(services).find(
    ([, svc]) => svc.container_name !== undefined,
  );
  if (named) {
    throw new Error(
      `Remove "container_name" from service "${named[0]}": Tomo names containers itself so it can proxy and monitor them`,
    );
  }

  const mappings = Object.fromEntries(
    Object.entries(services).map(([name, svc]) => [name, portMappings(svc)]),
  );
  const service = chooseService(mappings, requestedPort);
  const port = matchContainerPort(mappings[service], requestedPort) ?? requestedPort;
  if (port !== requestedPort) {
    log.info("Translated host port to container port for proxy", {
      service,
      requestedPort,
      containerPort: port,
    });
  }
  return {
    service,
    port,
    hostNetwork: services[service].network_mode === "host",
  };
}
