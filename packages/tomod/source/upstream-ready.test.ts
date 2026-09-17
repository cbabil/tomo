import { describe, it, expect } from "vitest";
import { buildProbeArgs, classifyProbe } from "./upstream-ready.js";
import { upstreamHost } from "./traefik-proxy.js";

describe("buildProbeArgs", () => {
  it("execs a shell loop in the proxy container", () => {
    const args = buildProbeArgs("tomo-litellm-litellm-1", 4000);
    expect(args.slice(0, 4)).toEqual(["exec", "tomo-proxy", "sh", "-c"]);
    expect(args[4]).toContain('nc -z -w 1 "$1" "$2"');
  });

  it("passes host and port as positional parameters, never inside the script", () => {
    const hostile = "x; rm -rf /";
    const args = buildProbeArgs(hostile, 4000);
    expect(args[4]).not.toContain(hostile);
    expect(args.slice(5)).toEqual(["probe", hostile, "4000"]);
  });
});

describe("classifyProbe", () => {
  it("is ready on exit 0", () => {
    expect(classifyProbe({ exitCode: 0 })).toBe("ready");
  });

  it("is timeout when the loop exhausts its attempts", () => {
    expect(classifyProbe({ exitCode: 1, stderr: "" })).toBe("timeout");
  });

  it("is timeout when the overall ceiling kills the probe", () => {
    expect(classifyProbe({ exitCode: undefined, timedOut: true })).toBe("timeout");
  });

  it("is unavailable when the proxy container is missing or stopped", () => {
    expect(
      classifyProbe({ exitCode: 1, stderr: "Error response from daemon: No such container: tomo-proxy" }),
    ).toBe("unavailable");
    expect(classifyProbe({ exitCode: 1, stderr: "container abc is not running" })).toBe("unavailable");
  });

  it("is unavailable when docker could not be spawned", () => {
    expect(classifyProbe({ exitCode: undefined, stderr: "" })).toBe("unavailable");
  });
});

describe("upstreamHost", () => {
  it("uses the compose container name on the Tomo network", () => {
    expect(upstreamHost("litellm", { service: "litellm", port: 4000 })).toBe(
      "tomo-litellm-litellm-1",
    );
  });

  it("uses the host gateway for host-networked apps", () => {
    expect(
      upstreamHost("dns", { service: "app", port: 53, hostNetwork: true }),
    ).toBe("host.docker.internal");
  });
});
