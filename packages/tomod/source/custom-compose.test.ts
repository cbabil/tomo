import { describe, it, expect } from "vitest";
import yaml from "js-yaml";
import { resolveProxyTarget, inspectCompose, unpublishProxiedPort } from "./custom-compose.js";

const LITELLM = `services:
  litellm:
    image: litellm
    environment:
      - DATABASE_URL=postgresql://db:5432/litellm
    depends_on:
      db:
        condition: service_healthy
  db:
    image: postgres:16
`;

describe("resolveProxyTarget: choosing the main service", () => {
  it("uses the only service", () => {
    const yaml = "services:\n  web:\n    image: nginx\n";
    expect(resolveProxyTarget(yaml, 80, "my-app")).toEqual({
      service: "web",
      port: 80,
      hostNetwork: false,
    });
  });

  it("prefers a service named app", () => {
    const yaml = "services:\n  db:\n    image: postgres\n  app:\n    image: nginx\n";
    expect(resolveProxyTarget(yaml, 80, "whatever").service).toBe("app");
  });

  it("uses the service that exposes the port", () => {
    const yaml = `services:
  db:
    image: postgres
  web:
    image: nginx
    expose:
      - "8080"
  worker:
    image: worker
`;
    expect(resolveProxyTarget(yaml, 8080, "thing").service).toBe("web");
  });

  it("uses the service whose name matches the app id", () => {
    const yaml = "services:\n  cache:\n    image: redis\n  litellm:\n    image: litellm\n";
    expect(resolveProxyTarget(yaml, 4000, "litellm").service).toBe("litellm");
  });

  it("uses the one service nothing else depends on", () => {
    expect(resolveProxyTarget(LITELLM, 4000, "my-gateway")).toEqual({
      service: "litellm",
      port: 4000,
      hostNetwork: false,
    });
  });

  it("understands list-style depends_on", () => {
    const yaml = `services:
  db:
    image: postgres
  web:
    image: nginx
    depends_on:
      - db
`;
    expect(resolveProxyTarget(yaml, 80, "site").service).toBe("web");
  });

  it("rejects a file where the main service cannot be determined", () => {
    const yaml = "services:\n  one:\n    image: a\n  two:\n    image: b\n";
    expect(() => resolveProxyTarget(yaml, 80, "site")).toThrow(/several services.*"app"/s);
  });

  it("reports host networking on the proxied service", () => {
    const yaml = "services:\n  web:\n    image: nginx\n    network_mode: host\n";
    expect(resolveProxyTarget(yaml, 80, "site").hostNetwork).toBe(true);
  });
});

describe("resolveProxyTarget: published web port", () => {
  it("accepts a mapping of the container port; the install strips it", () => {
    const yaml = `services:
  litellm:
    image: litellm
    ports:
      - "4000:4000"
    depends_on:
      - db
  db:
    image: postgres:16
`;
    expect(resolveProxyTarget(yaml, 4000, "litellm")).toEqual({
      service: "litellm",
      port: 4000,
      hostNetwork: false,
    });
  });

  it("translates the host side of a mapping to the container port", () => {
    const yaml = "services:\n  web:\n    image: nginx\n    ports:\n      - \"8080:3000/tcp\"\n";
    expect(resolveProxyTarget(yaml, 8080, "site").port).toBe(3000);
  });
});

describe("inspectCompose", () => {
  const litellm = `services:
  litellm:
    image: litellm
    ports:
      - "4000:4000"
    depends_on:
      - db
  db:
    image: postgres:16
`;

  it("detects the container port and the mapping that will be removed", () => {
    expect(inspectCompose(litellm, "LiteLLM")).toEqual({
      service: "litellm",
      containerPort: 4000,
      publishedMapping: "4000:4000",
    });
  });

  it("uses the port the user typed to pick among several mappings", () => {
    const yaml = `services:
  web:
    image: x
    ports:
      - "2222:22"
      - "8080:3000"
`;
    expect(inspectCompose(yaml, "Web", 3000)).toEqual({
      service: "web",
      containerPort: 3000,
      publishedMapping: "8080:3000",
    });
    expect(inspectCompose(yaml, "Web", 8080).containerPort).toBe(3000);
  });

  it("falls back to a single expose entry and reports nothing to remove", () => {
    const yaml = "services:\n  web:\n    image: x\n    expose:\n      - \"9000\"\n";
    expect(inspectCompose(yaml, "Web")).toEqual({ service: "web", containerPort: 9000 });
  });

  it("leaves the port undefined when it cannot be inferred", () => {
    const yaml = "services:\n  web:\n    image: x\n";
    expect(inspectCompose(yaml, "Web")).toEqual({ service: "web" });
  });

  it("returns an error message instead of throwing for unusable YAML", () => {
    expect(inspectCompose("not: [valid", "Web")).toEqual({
      error: expect.stringMatching(/Invalid compose YAML/),
    });
    expect(inspectCompose("services:\n  a:\n    image: x\n  b:\n    image: y\n", "Web")).toEqual({
      error: expect.stringMatching(/several services/),
    });
  });
});

describe("unpublishProxiedPort", () => {
  type Doc = { services: Record<string, { ports?: unknown[] }> };
  const portsOf = (content: string, service: string) =>
    (yaml.load(content) as Doc).services[service].ports;

  it("removes only the TCP mapping of the proxied port on the proxied service", () => {
    const input = `services:
  gitea:
    image: gitea
    ports:
      - "3000:3000"
      - "2222:22"
      - "3000:3000/udp"
  db:
    image: postgres
    ports:
      - "5432:5432"
`;
    const out = unpublishProxiedPort(input, { service: "gitea", port: 3000 });
    expect(portsOf(out, "gitea")).toEqual(["2222:22", "3000:3000/udp"]);
    expect(portsOf(out, "db")).toEqual(["5432:5432"]);
  });

  it("drops the ports key when nothing is left, and leaves untouched files alone", () => {
    const only = "services:\n  web:\n    image: x\n    ports:\n      - target: 80\n        published: 8080\n";
    expect(portsOf(unpublishProxiedPort(only, { service: "web", port: 80 }), "web")).toBeUndefined();
    const none = "services:\n  web:\n    image: x\n";
    expect(unpublishProxiedPort(none, { service: "web", port: 80 })).toBe(none);
    const host = "services:\n  web:\n    image: x\n    network_mode: host\n    ports:\n      - \"80:80\"\n";
    expect(unpublishProxiedPort(host, { service: "web", port: 80, hostNetwork: true })).toBe(host);
  });
});

describe("resolveProxyTarget: invalid documents", () => {
  it("rejects a compose file without services", () => {
    expect(() => resolveProxyTarget("version: '3'\n", 80, "x")).toThrow(/at least one service/);
    expect(() => resolveProxyTarget("not: [valid", 80, "x")).toThrow(/Invalid compose YAML/);
  });

  it("rejects container_name on any service", () => {
    const yaml = `services:
  web:
    image: nginx
    depends_on:
      - db
  db:
    image: postgres
    container_name: mine
`;
    expect(() => resolveProxyTarget(yaml, 80, "x")).toThrow(/container_name.*"db"/);
  });
});
