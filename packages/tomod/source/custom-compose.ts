/**
 * Resolves which compose service (and which container port) Traefik should
 * proxy for a compose file that has no `app_proxy` block (custom apps and
 * templates), and validates that the file does not publish that port.
 *
 * Traefik reaches the app over the internal Docker network using the
 * container-side port, so a `ports:` mapping for it is never needed. Worse,
 * it would expose the app on the host without the Tomo login, so such a
 * mapping is rejected at install with an actionable message.
 */
import { loadServices, type ComposeService, type ComposeServices } from "./compose-utils.js";
import type { ProxyTarget } from "./app.js";

/** Service name Tomo generates and prefers when a compose file has several. */
export const DEFAULT_SERVICE = "app";

interface PortMapping {
  host?: number;
  container: number;
  udp: boolean;
}

function parseShortPort(entry: string): PortMapping | undefined {
  const [mapping, protocol] = entry.split("/");
  const parts = mapping.split(":");
  const container = parseInt(parts[parts.length - 1], 10);
  if (isNaN(container)) return undefined;
  const host = parts.length > 1 ? parseInt(parts[parts.length - 2], 10) : NaN;
  return { host: isNaN(host) ? undefined : host, container, udp: protocol === "udp" };
}

function parseLongPort(entry: Record<string, unknown>): PortMapping | undefined {
  const container = Number(entry.target);
  if (!Number.isInteger(container)) return undefined;
  const published = Number(entry.published);
  return {
    host: Number.isInteger(published) ? published : undefined,
    container,
    udp: entry.protocol === "udp",
  };
}

/** Parse one `ports:`/`expose:` entry in short ("8080:80/tcp") or long ({target, published}) syntax. */
function parsePortEntry(entry: unknown): PortMapping | undefined {
  if (typeof entry === "string" || typeof entry === "number") {
    return parseShortPort(String(entry));
  }
  if (entry && typeof entry === "object") {
    return parseLongPort(entry as Record<string, unknown>);
  }
  return undefined;
}

function parsePortList(list: unknown): PortMapping[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((entry) => parsePortEntry(entry) ?? []);
}

/** The TCP mapping the requested number refers to, on either its container or host side. */
function findWebMapping(mappings: PortMapping[], requestedPort: number): PortMapping | undefined {
  const tcp = mappings.filter((m) => !m.udp);
  return (
    tcp.find((m) => m.container === requestedPort) ??
    tcp.find((m) => m.host === requestedPort)
  );
}

/** Names of the services a service lists under `depends_on` (list or map form). */
function dependencies(service: ComposeService): string[] {
  const deps = service.depends_on;
  if (Array.isArray(deps)) return deps.map(String);
  return deps && typeof deps === "object" ? Object.keys(deps) : [];
}

/**
 * Identify the main (web) service without relying on a published port:
 * the only service, one named "app", one that maps or exposes the port, one
 * named after the app, or the single service nothing else depends on.
 */
function chooseService(services: ComposeServices, requestedPort: number, appId: string): string {
  const names = Object.keys(services);
  if (names.length === 1) return names[0];
  if (DEFAULT_SERVICE in services) return DEFAULT_SERVICE;

  const byPort = names.find((n) => {
    const svc = services[n];
    return findWebMapping([...parsePortList(svc.ports), ...parsePortList(svc.expose)], requestedPort);
  });
  if (byPort) return byPort;

  if (appId in services) return appId;

  const dependedOn = new Set(names.flatMap((n) => dependencies(services[n])));
  const roots = names.filter((n) => !dependedOn.has(n));
  if (roots.length === 1) return roots[0];

  throw new Error(
    `Compose YAML defines several services (${names.join(", ")}) and Tomo cannot tell which one is the web app. Name that service "${DEFAULT_SERVICE}"`,
  );
}

function describeMapping(mapping: PortMapping): string {
  return mapping.host === undefined
    ? String(mapping.container)
    : `${mapping.host}:${mapping.container}`;
}

/**
 * Pick the service Traefik should proxy and the container port to dial.
 *
 * @param appId slug of the app being installed, used to recognise its service
 * @throws when the YAML is invalid, has no services, is ambiguous about the
 *   main service, sets `container_name` on any service (Tomo locates
 *   containers by compose's generated names), or publishes the proxied port.
 */
export function resolveProxyTarget(
  composeYaml: string,
  requestedPort: number,
  appId: string,
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

  const service = chooseService(services, requestedPort, appId);
  const hostNetwork = services[service].network_mode === "host";

  // Compose ignores `ports:` under host networking, so there is nothing to publish.
  const published = hostNetwork
    ? undefined
    : findWebMapping(parsePortList(services[service].ports), requestedPort);
  if (published) {
    const fixPort =
      published.container === requestedPort
        ? ""
        : ` and set Container Port to ${published.container}`;
    throw new Error(
      `Remove the "${describeMapping(published)}" port mapping from service "${service}"${fixPort}. Tomo serves the app through its login proxy using the Container Port field, so the mapping is not needed and would expose the app without sign-in`,
    );
  }

  return { service, port: requestedPort, hostNetwork };
}
