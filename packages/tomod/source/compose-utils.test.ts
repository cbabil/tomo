import { describe, it, expect } from "vitest";
import yaml from "js-yaml";
import { attachTomoNetwork } from "./compose-utils.js";

type Doc = { services: Record<string, Record<string, unknown>>; networks?: Record<string, unknown> };

const parse = (content: string) => yaml.load(content) as Doc;

describe("attachTomoNetwork", () => {
  it("attaches when the name only appears in a comment", () => {
    const input = "# attach to tomo_main please\nservices:\n  web:\n    image: nginx\n";
    const out = parse(attachTomoNetwork(input));
    expect(out.services.web.networks).toEqual(["tomo_main"]);
    expect(out.networks).toEqual({ tomo_main: { external: true } });
  });

  it("returns content unchanged when every service already lists the network", () => {
    const list = "services:\n  web:\n    image: nginx\n    networks:\n      - tomo_main\n";
    const map = "services:\n  web:\n    image: nginx\n    networks:\n      tomo_main: {}\n";
    expect(attachTomoNetwork(list)).toBe(list);
    expect(attachTomoNetwork(map)).toBe(map);
  });

  it("leaves services that use network_mode alone", () => {
    const input = "services:\n  web:\n    image: nginx\n    network_mode: host\n";
    expect(attachTomoNetwork(input)).toBe(input);
  });

  it("attaches a body-less service", () => {
    const out = parse(attachTomoNetwork("services:\n  web:\n"));
    expect(out.services.web.networks).toEqual(["tomo_main"]);
  });

  it("attaches only the services that are missing the network", () => {
    const input =
      "services:\n  web:\n    image: nginx\n    networks:\n      - tomo_main\n  db:\n    image: postgres\n    networks:\n      backend: {}\n";
    const out = parse(attachTomoNetwork(input));
    expect(out.services.web.networks).toEqual(["tomo_main"]);
    expect(out.services.db.networks).toEqual({ backend: {}, tomo_main: {} });
  });

  it("throws on invalid YAML", () => {
    expect(() => attachTomoNetwork("not: [valid")).toThrow(/Invalid compose YAML/);
  });
});
