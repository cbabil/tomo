import { APP_PORT_MIN, APP_PORT_MAX } from "./config.js";
import type { App } from "./app.js";
import type { ProxyTarget } from "./app.js";

export class PortAllocator {
  constructor(
    private readonly instances: Map<string, App>,
    private readonly pendingPorts: Set<number>,
  ) {}

  allocate(): number {
    const usedPorts = new Set(
      [...this.instances.values()]
        .map((app) => app.proxyTarget?.hostPort)
        .filter((p): p is number => p !== undefined),
    );
    let port = APP_PORT_MIN;
    while (usedPorts.has(port) || this.pendingPorts.has(port)) {
      port++;
    }
    if (port > APP_PORT_MAX) {
      throw new Error(
        `App port range exhausted (${APP_PORT_MIN}–${APP_PORT_MAX})`,
      );
    }
    this.pendingPorts.add(port);
    return port;
  }

  assign(target: ProxyTarget, existing?: ProxyTarget): ProxyTarget {
    if (target.hostPort) return target;
    return {
      ...target,
      hostPort: existing?.hostPort ?? this.allocate(),
    };
  }
}
