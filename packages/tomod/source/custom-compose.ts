/**
 * Resolves which compose service (and which container port) Traefik should
 * proxy for a compose file that has no `app_proxy` block (custom apps and
 * templates), and validates that the file does not publish that port.
 *
 * Traefik reaches the app over the internal Docker network using the
 * container-side port, so a `ports:` mapping for it is never needed. Worse,
 * it would expose the app on the host without the Tomo login, so the install
 * removes that mapping (see unpublishProxiedPort) and the dialog says so up
 * front (see inspectCompose).
 */
import {
  dumpCompose,
  loadRoot,
  loadServices,
  servicesOf,
  type ComposeService,
  type ComposeServices,
} from "./compose-utils.js";
import { slugify } from "./utils.js";
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
function chooseService(
  services: ComposeServices,
  requestedPort: number | undefined,
  appId: string,
): string {
  const names = Object.keys(services);
  if (names.length === 1) return names[0];
  if (DEFAULT_SERVICE in services) return DEFAULT_SERVICE;

  const byPort =
    requestedPort === undefined
      ? undefined
      : names.find((n) => findWebMapping(allMappings(services[n]), requestedPort));
  if (byPort) return byPort;

  if (appId in services) return appId;

  const dependedOn = new Set(names.flatMap((n) => dependencies(services[n])));
  const roots = names.filter((n) => !dependedOn.has(n));
  if (roots.length === 1) return roots[0];

  throw new Error(
    `Compose YAML defines several services (${names.join(", ")}) and Tomo cannot tell which one is the web app. Name that service "${DEFAULT_SERVICE}"`,
  );
}

/** Every port a service maps or exposes, published ones first. */
function allMappings(service: ComposeService): PortMapping[] {
  return [...parsePortList(service.ports), ...parsePortList(service.expose)];
}

/** The one TCP port a service is evidently meant to serve on, if that is unambiguous. */
function inferContainerPort(service: ComposeService): number | undefined {
  const tcp = allMappings(service).filter((m) => !m.udp);
  const distinct = [...new Set(tcp.map((m) => m.container))];
  return distinct.length === 1 ? distinct[0] : undefined;
}

function describeMapping(mapping: PortMapping): string {
  return mapping.host === undefined
    ? String(mapping.container)
    : `${mapping.host}:${mapping.container}`;
}

interface MainService {
  service: string;
  definition: ComposeService;
  hostNetwork: boolean;
}

/**
 * Find the service that is the app, after checking the file is usable.
 *
 * @param appId slug of the app being installed, used to recognise its service
 * @throws when the YAML is invalid, has no services, is ambiguous about the
 *   main service, or sets `container_name` on any service (Tomo locates
 *   containers by compose's generated names).
 */
function locateMainService(
  composeYaml: string,
  requestedPort: number | undefined,
  appId: string,
): MainService {
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
  const definition = services[service];
  return { service, definition, hostNetwork: definition.network_mode === "host" };
}

/**
 * Pick the service Traefik should proxy and the container port to dial. A
 * requested port that matches the host side of a mapping is translated to
 * the container side.
 *
 * @throws see locateMainService
 */
export function resolveProxyTarget(
  composeYaml: string,
  requestedPort: number,
  appId: string,
): ProxyTarget {
  const { service, definition, hostNetwork } = locateMainService(composeYaml, requestedPort, appId);
  const port = findWebMapping(allMappings(definition), requestedPort)?.container ?? requestedPort;
  return { service, port, hostNetwork };
}

export interface ComposeInspection {
  service?: string;
  /** Port the main service listens on, when the file makes that unambiguous. */
  containerPort?: number;
  /** A host mapping of that port, as written, which the install will remove. */
  publishedMapping?: string;
  /** Why the file cannot be used as is, when it cannot. */
  error?: string;
}

/**
 * What the Add dialog needs to know about a pasted compose file before the
 * user clicks Add: which service is the app, which port to prefill, and
 * whether a published mapping will be removed. Never throws.
 */
export function inspectCompose(
  composeYaml: string,
  appName: string,
  requestedPort?: number,
): ComposeInspection {
  try {
    const { service, definition, hostNetwork } = locateMainService(
      composeYaml,
      requestedPort,
      slugify(appName),
    );
    const containerPort =
      requestedPort === undefined
        ? inferContainerPort(definition)
        : (findWebMapping(allMappings(definition), requestedPort)?.container ?? requestedPort);
    const published =
      containerPort === undefined || hostNetwork
        ? undefined
        : parsePortList(definition.ports).find((m) => !m.udp && m.container === containerPort);
    return {
      service,
      ...(containerPort !== undefined && { containerPort }),
      ...(published && { publishedMapping: describeMapping(published) }),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Remove the host mapping for the proxied TCP port so the app is reachable
 * only through Traefik, behind the Tomo login. Other published ports (SSH,
 * DNS, UDP...) are kept. Host-networked apps publish nothing and are skipped.
 *
 * @returns the compose YAML, unchanged when there is nothing to remove
 */
export function unpublishProxiedPort(composeYaml: string, target: ProxyTarget): string {
  if (target.hostNetwork) return composeYaml;
  const root = loadRoot(composeYaml);
  const services = servicesOf(root);
  const service = services?.[target.service];
  if (!root || !services || !service || !Array.isArray(service.ports)) return composeYaml;

  const kept = service.ports.filter((entry) => {
    const mapping = parsePortEntry(entry);
    return !mapping || mapping.udp || mapping.container !== target.port;
  });
  if (kept.length === service.ports.length) return composeYaml;

  const { ports: _removed, ...rest } = service;
  const patched = kept.length > 0 ? { ...rest, ports: kept } : rest;
  return dumpCompose({ ...root, services: { ...services, [target.service]: patched } });
}
