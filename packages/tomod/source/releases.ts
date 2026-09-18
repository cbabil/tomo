/**
 * Tomo's releases on GitHub: which is newest, which are newer than the
 * installed version, and their notes. Cached so the desktop's update check
 * does not spend GitHub's unauthenticated rate limit.
 */
import { createLogger } from "./logger.js";

const log = createLogger("releases");

const RELEASES_URL = "https://api.github.com/repos/cbabil/tomo/releases?per_page=15";
const CACHE_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

export interface Release {
  version: string;
  publishedAt: string;
  /** Markdown, as written by the release workflow. */
  notes: string;
  url: string;
}

interface GitHubRelease {
  tag_name: string;
  published_at: string;
  body: string | null;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
}

/** Negative when `a` is older than `b`. Compares dotted numbers, so 0.0.9 is older than 0.0.10. */
export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export interface ReleaseStatus {
  latest: string | null;
  updateAvailable: boolean;
  /** Releases newer than the installed version, newest first. */
  newer: Release[];
  installed: Release | undefined;
}

export function releaseStatus(releases: Release[] | null, current: string): ReleaseStatus {
  const list = releases ?? [];
  const newer = list.filter((r) => compareVersions(r.version, current) > 0);
  return {
    latest: list[0]?.version ?? null,
    updateAvailable: newer.length > 0,
    newer,
    installed: list.find((r) => compareVersions(r.version, current) === 0),
  };
}

async function fetchFromGitHub(): Promise<GitHubRelease[]> {
  const res = await fetch(RELEASES_URL, {
    headers: { Accept: "application/vnd.github.v3+json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  return (await res.json()) as GitHubRelease[];
}

export class ReleaseFeed {
  private cache?: { at: number; releases: Release[] };
  /** A fetch in progress, shared by everyone who asks while it runs. */
  private pending?: Promise<void>;

  constructor(
    private readonly fetchJson: () => Promise<GitHubRelease[]> = fetchFromGitHub,
    private readonly now: () => number = Date.now,
  ) {}

  /** Published releases, newest first; null when GitHub was never reachable. */
  async list(force = false): Promise<Release[] | null> {
    const fresh = this.cache !== undefined && this.now() - this.cache.at < CACHE_MS;
    if (fresh && !force) return this.cache?.releases ?? null;
    this.pending ??= this.refresh().finally(() => {
      this.pending = undefined;
    });
    await this.pending;
    return this.cache?.releases ?? null;
  }

  private async refresh(): Promise<void> {
    try {
      const releases = (await this.fetchJson())
        .filter((r) => !r.draft && !r.prerelease)
        .map((r) => ({ version: r.tag_name.replace(/^v/, ""), publishedAt: r.published_at, notes: r.body ?? "", url: r.html_url }))
        .sort((a, b) => compareVersions(b.version, a.version));
      this.cache = { at: this.now(), releases };
    } catch (err) {
      log.warn("Could not reach GitHub for releases", { error: String(err) });
    }
  }

  /** When the list was last fetched successfully. */
  checkedAt(): string | undefined {
    return this.cache && new Date(this.cache.at).toISOString();
  }
}
