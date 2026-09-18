import { describe, it, expect, vi } from "vitest";
import { compareVersions, releaseStatus, ReleaseFeed, type Release } from "./releases.js";

const release = (version: string): Release => ({
  version,
  publishedAt: "2026-09-18T12:00:00Z",
  notes: `### Features\n- **ui**: ${version}`,
  url: `https://github.com/cbabil/tomo/releases/tag/v${version}`,
});
const github = (versions: string[]) =>
  versions.map((v) => ({ tag_name: `v${v}`, published_at: "2026-09-18T12:00:00Z", body: `### Features\n- **ui**: ${v}`, html_url: `https://github.com/cbabil/tomo/releases/tag/v${v}`, draft: false, prerelease: false }));

describe("compareVersions", () => {
  it("compares dotted numbers, not strings", () => {
    expect(compareVersions("0.0.75", "0.0.74")).toBeGreaterThan(0);
    expect(compareVersions("0.0.9", "0.0.10")).toBeLessThan(0);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
  });
});

describe("releaseStatus", () => {
  const releases = [release("0.0.75"), release("0.0.74"), release("0.0.73")];

  it("lists every release newer than the installed one, and the installed one", () => {
    const status = releaseStatus(releases, "0.0.73");
    expect(status).toMatchObject({ latest: "0.0.75", updateAvailable: true });
    expect(status.newer.map((r) => r.version)).toEqual(["0.0.75", "0.0.74"]);
    expect(status.installed?.version).toBe("0.0.73");
  });

  it("does not offer a downgrade to a build ahead of the latest release", () => {
    expect(releaseStatus(releases, "0.0.76")).toMatchObject({ latest: "0.0.75", updateAvailable: false, newer: [] });
  });

  it("reports nothing when the feed is unreachable", () => {
    expect(releaseStatus(null, "0.0.73")).toEqual({ latest: null, updateAvailable: false, newer: [], installed: undefined });
  });
});

describe("ReleaseFeed", () => {
  it("caches for ten minutes, refetches when forced, and skips drafts", async () => {
    let now = 0;
    const fetchJson = vi.fn(async () => [...github(["0.0.75", "0.0.74"]), { ...github(["0.0.80"])[0], draft: true }]);
    const feed = new ReleaseFeed(fetchJson, () => now);
    expect((await feed.list())?.map((r) => r.version)).toEqual(["0.0.75", "0.0.74"]);
    now += 9 * 60_000;
    await feed.list();
    expect(fetchJson).toHaveBeenCalledTimes(1);
    await feed.list(true);
    expect(fetchJson).toHaveBeenCalledTimes(2);
    now += 11 * 60_000;
    await feed.list();
    expect(fetchJson).toHaveBeenCalledTimes(3);
    expect(feed.checkedAt()).toBe(new Date(now).toISOString());
  });

  it("shares one request between callers that ask at the same time", async () => {
    const fetchJson = vi.fn(async () => github(["0.0.75"]));
    const feed = new ReleaseFeed(fetchJson, () => 0);
    await Promise.all([feed.list(), feed.list(), feed.list(true)]);
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it("keeps the last good list when GitHub cannot be reached", async () => {
    let fail = false;
    const feed = new ReleaseFeed(async () => {
      if (fail) throw new Error("offline");
      return github(["0.0.75"]);
    }, () => 0);
    await feed.list();
    fail = true;
    expect((await feed.list(true))?.map((r) => r.version)).toEqual(["0.0.75"]);
    expect(await new ReleaseFeed(async () => { throw new Error("offline"); }).list()).toBeNull();
  });
});
