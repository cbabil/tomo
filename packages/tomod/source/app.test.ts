import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./upstream-ready.js", () => ({ waitForApp: vi.fn(async () => {}) }));

import { App, type AppStatus } from "./app.js";
import { waitForApp } from "./upstream-ready.js";
import type { Docker } from "./docker.js";

function makeApp(status: AppStatus, events: string[]) {
  // The docker mock needs the app it belongs to, which is created after it.
  const ref: { app?: App } = {};
  const current = () => ref.app?.getStatus();
  const record = (name: string) =>
    vi.fn(async () => {
      events.push(`${name}:${current()}`);
    });
  const docker = {
    composeUp: record("up"),
    composePull: record("pull"),
    composeDown: record("down"),
  } as unknown as Docker;
  const app = new App(
    {
      id: "demo",
      name: "Demo",
      version: "custom",
      installedAt: "2026-01-01T00:00:00.000Z",
      dataDir: "/data/apps/demo",
      status,
      type: "custom",
      proxyTarget: { service: "app", port: 80, hostPort: 8001 },
    },
    docker,
  );
  ref.app = app;
  vi.mocked(waitForApp).mockImplementation(async () => {
    events.push(`wait:${current()}`);
  });
  return { app, docker };
}

describe("App lifecycle statuses", () => {
  let events: string[];
  beforeEach(() => {
    events = [];
  });

  it("stays installing while containers are created, then starting until reachable", async () => {
    const { app } = makeApp("installing", events);
    await app.start();
    expect(events).toEqual(["up:installing", "wait:starting"]);
    expect(app.getStatus()).toBe("running");
  });

  it("is starting throughout a plain start", async () => {
    const { app } = makeApp("stopped", events);
    await app.start();
    expect(events).toEqual(["up:starting", "wait:starting"]);
    expect(app.getStatus()).toBe("running");
  });

  it("pulls new images before recreating on update", async () => {
    const { app, docker } = makeApp("running", events);
    await app.pullAndRecreate();
    expect(events).toEqual(["pull:restarting", "up:restarting", "wait:restarting"]);
    expect(docker.composePull).toHaveBeenCalledWith(
      "/data/apps/demo/docker-compose.yml",
      "tomo-demo",
    );
    expect(app.getStatus()).toBe("running");
  });

  it("restores the previous status when an update fails", async () => {
    const { app, docker } = makeApp("running", events);
    vi.mocked(docker.composePull).mockRejectedValueOnce(new Error("pull failed"));
    await expect(app.pullAndRecreate()).rejects.toThrow("pull failed");
    expect(app.getStatus()).toBe("running");
  });
});
