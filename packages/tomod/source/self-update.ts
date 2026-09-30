/**
 * Self-update: download a Tomo release .deb, verify that Tomo's own release
 * pipeline signed it, and hand it to dpkg.
 *
 * Releases are signed keylessly with Sigstore by `.github/workflows/release.yml`
 * on a `v*` tag; every asset ships with `<asset>.sigstore.json`. Verification
 * pins that workflow at the exact version tag, so only a tag build of this
 * repository's release workflow can produce an installable update. A release
 * without a bundle, or with a bundle that doesn't verify, is refused.
 */

import fs from "node:fs/promises";
import { spawn as nodeSpawn } from "node:child_process";
import path from "node:path";
import type { Bundle, VerifyOptions } from "sigstore";
import { TOMO_DATA_DIR } from "./config.js";
import { createLogger } from "./logger.js";
import { RELEASE_VERSION, TOMO_REPO } from "./releases.js";

const log = createLogger("self-update");

/**
 * Sigstore's trust-root cache. The library defaults to the user's home, which
 * tomod can't write under ProtectHome=yes; the data dir is root-owned and
 * writable by the service, and nothing else may write there.
 */
export const TUF_CACHE_DIR = path.join(TOMO_DATA_DIR, "sigstore-tuf");
/**
 * Where the downloaded .deb goes: the data dir is in the unit's ReadWritePaths
 * and, unlike /tmp (PrivateTmp), visible to the systemd-run unit that installs it.
 */
export const UPDATE_DEB_PATH = path.join(TOMO_DATA_DIR, "tomo_update.deb");

const ARCHES = new Set(["amd64", "arm64"]);

/**
 * What sigstore checks while verifying: GitHub Actions' OIDC issuer. The
 * signer's identity is then compared to the release workflow's exactly
 * (sigstore would treat an identity option as a regular expression).
 */
export const VERIFY_OPTIONS: VerifyOptions = {
  certificateIssuer: "https://token.actions.githubusercontent.com",
  tufCachePath: TUF_CACHE_DIR,
};

/** The certificate identity of a release.yml run on the tag for `version`. */
function releaseIdentity(version: string): string {
  return `https://github.com/${TOMO_REPO}/.github/workflows/release.yml@refs/tags/v${version}`;
}

function debAssetUrl(version: string, arch: string): string {
  return `https://github.com/${TOMO_REPO}/releases/download/v${version}/tomo_${version}_${arch}.deb`;
}

/** What sigstore's verify() reports about the signer: enough to check the identity. */
export interface VerifiedSigner {
  identity?: { subjectAlternativeName?: string };
}

/** Everything with side effects, injectable for tests. */
export interface SelfUpdateDeps {
  /** Debian architecture of this host. */
  arch: string;
  fetch: typeof fetch;
  verify: (bundle: Bundle, artifact: Buffer, options: VerifyOptions) => Promise<VerifiedSigner>;
  writeFile: (path: string, data: Buffer) => Promise<void>;
  spawn: typeof nodeSpawn;
  /** Runs `fn` after the tRPC response has been sent (default: 1 s). */
  schedule: (fn: () => void) => void;
}

const defaultDeps: SelfUpdateDeps = {
  arch: process.arch === "arm64" ? "arm64" : "amd64",
  fetch,
  // Loaded on demand: updates are rare and the sigstore tree is large
  verify: async (bundle, artifact, options) => (await import("sigstore")).verify(bundle, artifact, options),
  writeFile: (path, data) => fs.writeFile(path, data),
  spawn: nodeSpawn,
  schedule: (fn) => setTimeout(fn, 1000),
};

export class SelfUpdater {
  constructor(private readonly deps: SelfUpdateDeps = defaultDeps) {}

  /** Download, verify and install release `version` for this host. */
  async install(version: string): Promise<void> {
    const { arch } = this.deps;
    if (!RELEASE_VERSION.test(version) || !ARCHES.has(arch)) {
      throw new Error(`Refusing to update to "${version}" for "${arch}": not a plain release version`);
    }
    const debUrl = debAssetUrl(version, arch);
    log.info("Downloading update", { version, arch, debUrl });

    // The bundle first: an unsigned release is refused before the big download
    const bundle = await this.downloadBundle(`${debUrl}.sigstore.json`, version);
    const artifact = await this.download(debUrl);
    await this.verify(bundle, artifact, version);

    await this.deps.writeFile(UPDATE_DEB_PATH, artifact);
    log.info("Installing update", { debPath: UPDATE_DEB_PATH });

    // dpkg must run outside tomod's ProtectSystem=strict sandbox: a detached
    // child inherits the mount restrictions, a systemd-run transient unit
    // does not. --no-block returns before the service restarts.
    this.deps.schedule(() => {
      const child = this.deps.spawn(
        "systemd-run",
        ["--unit=tomo-update", "--no-block", "--", "dpkg", "-i", UPDATE_DEB_PATH],
        { detached: true, stdio: "ignore" },
      );
      child.unref();
    });
  }

  private async verify(bundle: Bundle, artifact: Buffer, version: string): Promise<void> {
    const identity = releaseIdentity(version);
    let signer: VerifiedSigner;
    try {
      signer = await this.deps.verify(bundle, artifact, VERIFY_OPTIONS);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`Release v${version} failed signature verification: ${reason}`);
    }
    const signedBy = signer.identity?.subjectAlternativeName;
    if (signedBy !== identity) {
      throw new Error(`Release v${version} was signed by "${signedBy ?? "unknown"}", not by ${identity}`);
    }
    log.info("Update signature verified", { version, identity });
  }

  private async download(url: string): Promise<Buffer> {
    const res = await this.deps.fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) {
      throw new Error(`Failed to download .deb: ${res.status}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  private async downloadBundle(url: string, version: string): Promise<Bundle> {
    const res = await this.deps.fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) {
      throw new Error(
        `Release v${version} is not signed by Tomo's release pipeline (no signature bundle, HTTP ${res.status})`,
      );
    }
    return (await res.json()) as Bundle;
  }
}
