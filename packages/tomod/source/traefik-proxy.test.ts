import { describe, it, expect } from "vitest";
import { generateAppConfig } from "./traefik-proxy.js";

const target = { service: "app", port: 4000, hostPort: 8002 };

describe("generateAppConfig", () => {
  it("puts the Tomo login in front of an app by default", () => {
    const config = generateAppConfig("litellm", target);
    expect(config).toContain("- forward-auth");
    expect(config).toContain('url: "http://tomo-litellm-app-1:4000"');
    expect(config).toContain("- app-8002");
  });

  it("leaves the login out for an app that handles its own sign-in", () => {
    const config = generateAppConfig("litellm", { ...target, ownAuth: true });
    expect(config).not.toContain("forward-auth");
    expect(config).toContain("middlewares: []");
  });

  it("refuses a target without a host port", () => {
    expect(() => generateAppConfig("x", { service: "app", port: 80 })).toThrow(/hostPort/);
  });
});
