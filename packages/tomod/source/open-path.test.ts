import { describe, it, expect } from "vitest";
import { normalizeOpenPath, manifestOpenPath, MAX_OPEN_PATH_LENGTH } from "./open-path.js";

describe("normalizeOpenPath", () => {
  it("treats empty and root as no path", () => {
    expect(normalizeOpenPath("")).toBeUndefined();
    expect(normalizeOpenPath("   ")).toBeUndefined();
    expect(normalizeOpenPath("/")).toBeUndefined();
  });

  it("keeps a plain path, query and hash", () => {
    expect(normalizeOpenPath("/ui")).toBe("/ui");
    expect(normalizeOpenPath(" /admin/login ")).toBe("/admin/login");
    expect(normalizeOpenPath("/ui?tab=keys#top")).toBe("/ui?tab=keys#top");
  });

  it("adds a missing leading slash", () => {
    expect(normalizeOpenPath("ui")).toBe("/ui");
  });

  it("rejects anything that could leave the app's origin", () => {
    for (const bad of ["//evil.com", "http://evil.com", "/x://y", "\\\\evil", "/a\\b", "javascript:alert(1)"]) {
      expect(() => normalizeOpenPath(bad), bad).toThrow(/Open path/);
    }
  });

  it("rejects whitespace, control characters and oversized values", () => {
    expect(() => normalizeOpenPath("/a b")).toThrow(/Open path/);
    expect(() => normalizeOpenPath("/a\nb")).toThrow(/Open path/);
    expect(() => normalizeOpenPath("/a\u0007b")).toThrow(/Open path/);
    expect(() => normalizeOpenPath("/" + "a".repeat(MAX_OPEN_PATH_LENGTH))).toThrow(/Open path/);
  });
});

describe("manifestOpenPath", () => {
  it("normalises valid manifest paths", () => {
    expect(manifestOpenPath("/web")).toBe("/web");
    expect(manifestOpenPath("launch")).toBe("/launch");
    expect(manifestOpenPath("")).toBeUndefined();
    expect(manifestOpenPath(undefined)).toBeUndefined();
  });

  it("ignores invalid manifest paths instead of throwing", () => {
    expect(manifestOpenPath("//evil.com")).toBeUndefined();
  });
});
