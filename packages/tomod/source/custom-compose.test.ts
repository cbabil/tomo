import { describe, it, expect } from "vitest";
import { resolveProxyTarget } from "./custom-compose.js";

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
  it("rejects a mapping of the container port on the main service", () => {
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
    expect(() => resolveProxyTarget(yaml, 4000, "litellm")).toThrow(
      /Remove the "4000:4000" port mapping from service "litellm"/,
    );
  });

  it("rejects it when the user typed the host side of the mapping", () => {
    const yaml = "services:\n  web:\n    image: nginx\n    ports:\n      - \"8080:3000/tcp\"\n";
    expect(() => resolveProxyTarget(yaml, 8080, "site")).toThrow(
      /Remove the "8080:3000" port mapping.*Container Port to 3000/s,
    );
  });

  it("rejects long-syntax mappings too", () => {
    const yaml = `services:
  web:
    image: nginx
    ports:
      - target: 3000
        published: 4000
`;
    expect(() => resolveProxyTarget(yaml, 3000, "site")).toThrow(/Remove the "4000:3000" port mapping/);
  });

  it("allows other ports on the main service and ports on other services", () => {
    const yaml = `services:
  gitea:
    image: gitea
    ports:
      - "2222:22"
      - "3000:3000/udp"
    depends_on:
      - db
  db:
    image: postgres
    ports:
      - "5432:5432"
`;
    expect(resolveProxyTarget(yaml, 3000, "gitea")).toEqual({
      service: "gitea",
      port: 3000,
      hostNetwork: false,
    });
  });

  it("ignores ports on host-networked apps, where compose ignores them too", () => {
    const yaml = "services:\n  web:\n    image: nginx\n    network_mode: host\n    ports:\n      - \"80:80\"\n";
    expect(resolveProxyTarget(yaml, 80, "site").hostNetwork).toBe(true);
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
