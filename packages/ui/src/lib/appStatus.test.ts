import { describe, it, expect } from "vitest";
import { isBusyStatus, installPhaseKey } from "./appStatus";

describe("isBusyStatus", () => {
  it("is true while an app is changing state", () => {
    for (const status of ["installing", "starting", "restarting", "stopping"] as const) {
      expect(isBusyStatus(status), status).toBe(true);
    }
  });

  it("is false for settled states", () => {
    for (const status of ["running", "stopped", "error", "external"] as const) {
      expect(isBusyStatus(status), status).toBe(false);
    }
  });
});

describe("installPhaseKey", () => {
  it("tells pulling images apart from waiting for the app", () => {
    expect(installPhaseKey("installing")).toBe("install.phase.installing");
    expect(installPhaseKey("starting")).toBe("install.phase.starting");
  });

  it("falls back to a generic message before the app shows up or once it runs", () => {
    expect(installPhaseKey(undefined)).toBe("install.phase.preparing");
    expect(installPhaseKey("running")).toBe("install.phase.preparing");
  });
});
