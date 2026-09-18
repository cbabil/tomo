import { describe, it, expect } from "vitest";
import yaml from "js-yaml";
import { attachTomoNetwork, injectTomoEnvironment } from "./compose-utils.js";

type Service = Record<string, unknown>;
type Doc = { services: Record<string, Service>; networks?: Record<string, unknown> };

const parse = (content: string) => yaml.load(content) as Doc;

describe("attachTomoNetwork", () => {
  const twoServices = `services:
  web:
    image: nginx
  db:
    image: postgres
`;

  it("puts only the proxied service on the Tomo network, keeping its app-private network", () => {
    const out = parse(attachTomoNetwork(twoServices, "web"));
    expect(out.services.web.networks).toEqual(["default", "tomo_main"]);
    expect(out.services.db.networks).toBeUndefined();
    expect(out.networks).toEqual({ tomo_main: { external: true } });
  });

  it("keeps networks the proxied service already declares", () => {
    const input = `services:
  web:
    image: nginx
    networks:
      - backend
networks:
  backend: {}
`;
    const out = parse(attachTomoNetwork(input, "web"));
    expect(out.services.web.networks).toEqual(["backend", "tomo_main"]);
    expect(out.networks).toEqual({ backend: {}, tomo_main: { external: true } });
  });

  it("handles map-style networks on the proxied service", () => {
    const input = "services:\n  web:\n    image: nginx\n    networks:\n      backend: {}\n";
    const out = parse(attachTomoNetwork(input, "web"));
    expect(out.services.web.networks).toEqual({ backend: {}, tomo_main: {} });
  });

  it("returns content unchanged when the service is already attached", () => {
    const input = "services:\n  web:\n    image: nginx\n    networks:\n      - default\n      - tomo_main\n";
    expect(attachTomoNetwork(input, "web")).toBe(input);
  });

  it("leaves host-networked services and unknown services alone", () => {
    const host = "services:\n  web:\n    image: nginx\n    network_mode: host\n";
    expect(attachTomoNetwork(host, "web")).toBe(host);
    expect(attachTomoNetwork(twoServices, "missing")).toBe(twoServices);
    expect(attachTomoNetwork(twoServices, undefined)).toBe(twoServices);
  });

  it("throws on invalid YAML", () => {
    expect(() => attachTomoNetwork("not: [valid", "web")).toThrow(/Invalid compose YAML/);
  });
});

describe("injectTomoEnvironment", () => {
  it("prepends the Tomo variables to a list-style environment", () => {
    const input = "services:\n  app:\n    image: x\n    environment:\n      - FOO=bar\n";
    const out = parse(injectTomoEnvironment(input));
    expect(out.services.app.environment).toEqual([
      "APP_DATA_DIR=${APP_DATA_DIR}",
      "APP_PASSWORD=${APP_PASSWORD}",
      "FOO=bar",
    ]);
  });

  it("adds them to a map-style environment, which used to break the install", () => {
    const input = "services:\n  app:\n    image: x\n    environment:\n      FOO: bar\n";
    const out = parse(injectTomoEnvironment(input));
    expect(out.services.app.environment).toEqual({
      APP_DATA_DIR: "${APP_DATA_DIR}",
      APP_PASSWORD: "${APP_PASSWORD}",
      FOO: "bar",
    });
  });

  it("targets the proxied service even when a sidecar declares an environment first", () => {
    const input = `services:
  db:
    image: postgres
    environment:
      - POSTGRES_PASSWORD=x
  app:
    image: x
`;
    const out = parse(injectTomoEnvironment(input, "app"));
    expect(out.services.db.environment).toEqual(["POSTGRES_PASSWORD=x"]);
    expect(out.services.app.environment).toEqual([
      "APP_DATA_DIR=${APP_DATA_DIR}",
      "APP_PASSWORD=${APP_PASSWORD}",
    ]);
  });

  it("falls back to the first service that declares an environment", () => {
    const input = `services:
  db:
    image: postgres
  app:
    image: x
    environment:
      - A=1
  worker:
    image: y
    environment:
      - B=2
`;
    const out = parse(injectTomoEnvironment(input));
    expect(out.services.db.environment).toBeUndefined();
    expect((out.services.app.environment as string[])[0]).toBe("APP_DATA_DIR=${APP_DATA_DIR}");
    expect(out.services.worker.environment).toEqual(["B=2"]);
  });

  it("leaves files alone that declare no environment or already reference APP_DATA_DIR", () => {
    const none = "services:\n  app:\n    image: x\n";
    const already = "services:\n  app:\n    image: x\n    environment:\n      - APP_DATA_DIR=/x\n";
    expect(injectTomoEnvironment(none)).toBe(none);
    expect(injectTomoEnvironment(already)).toBe(already);
  });
});
