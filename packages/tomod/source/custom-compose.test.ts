import { describe, it, expect } from "vitest";
import { resolveProxyTarget } from "./custom-compose.js";

describe("resolveProxyTarget", () => {
  it("uses the only service and the requested port when no ports are mapped", () => {
    const yaml = `services:
  web:
    image: nginx
`;
    expect(resolveProxyTarget(yaml, 80)).toEqual({ service: "web", port: 80, hostNetwork: false });
  });

  it("prefers a service named app when several exist", () => {
    const yaml = `services:
  db:
    image: postgres
  app:
    image: nginx
`;
    expect(resolveProxyTarget(yaml, 80).service).toBe("app");
  });

  it("picks the service whose ports mention the requested port", () => {
    const yaml = `services:
  db:
    image: postgres
  web:
    image: nginx
    ports:
      - "4000:4000"
`;
    expect(resolveProxyTarget(yaml, 4000)).toEqual({ service: "web", port: 4000, hostNetwork: false });
  });

  it("translates a host-side port to the container-side port", () => {
    const yaml = `services:
  web:
    image: nginx
    ports:
      - "4000:3000/tcp"
`;
    expect(resolveProxyTarget(yaml, 4000)).toEqual({ service: "web", port: 3000, hostNetwork: false });
  });

  it("handles long-syntax port mappings", () => {
    const yaml = `services:
  web:
    image: nginx
    ports:
      - target: 3000
        published: 4000
`;
    expect(resolveProxyTarget(yaml, 4000)).toEqual({ service: "web", port: 3000, hostNetwork: false });
  });

  it("reports host networking on the proxied service", () => {
    const yaml = `services:
  web:
    image: nginx
    network_mode: host
`;
    expect(resolveProxyTarget(yaml, 80).hostNetwork).toBe(true);
  });

  it("rejects an ambiguous multi-service file instead of guessing", () => {
    const yaml = `services:
  db:
    image: postgres
  web:
    image: nginx
    ports:
      - "8080:80"
`;
    expect(() => resolveProxyTarget(yaml, 9999)).toThrow(/several services/);
  });

  it("rejects a compose file without services", () => {
    expect(() => resolveProxyTarget("version: '3'\n", 80)).toThrow(/at least one service/);
    expect(() => resolveProxyTarget("not: [valid", 80)).toThrow(/Invalid compose YAML/);
  });

  it("rejects container_name on any service", () => {
    const yaml = `services:
  web:
    image: nginx
    ports:
      - "80:80"
  db:
    image: postgres
    container_name: mine
`;
    expect(() => resolveProxyTarget(yaml, 80)).toThrow(/container_name.*"db"/);
  });
});
