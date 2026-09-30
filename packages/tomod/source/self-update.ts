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
import { verify as sigstoreVerify, type Bundle } from "sigstore";
import { createLogger } from "./logger.js";

const log = createLogger("self-update");

export const TOMO_RELEASE_REPO = "cbabil/tomo";
export const RELEASE_WORKFLOW = "release.yml";
/** GitHub Actions' OIDC issuer: the only issuer accepted for release signatures. */
export const SIGSTORE_ISSUER = "https://token.actions.githubusercontent.com";

/** The certificate identity of a release.yml run on the tag for `version`. */
export function releaseIdentity(version: string): string {
  return `https://github.com/${TOMO_RELEASE_REPO}/.github/workflows/${RELEASE_WORKFLOW}@refs/tags/v${version}`;
}

export function debAssetUrl(version: string, arch: string): string {
  return `https://github.com/${TOMO_RELEASE_REPO}/releases/download/v${version}/tomo_${version}_${arch}.deb`;
}

export interface VerifyOptions {
  certificateIssuer: string;
  certificateIdentityURI: string;
}

/** Everything with side effects, injectable for tests. */
export interface SelfUpdateDeps {
  fetch: typeof fetch;
  verify: (bundle: Bundle, artifact: Buffer, options: VerifyOptions) => Promise<unknown>;
  writeFile: (path: string, data: Buffer) => Promise<void>;
  spawn: typeof nodeSpawn;
  /** Runs `fn` after the tRPC response has been sent (default: 1 s). */
  schedule: (fn: () => void) => void;
}

const defaultDeps: SelfUpdateDeps = {
  fetch,
  verify: (bundle, artifact, options) => sigstoreVerify(bundle, artifact, options),
  writeFile: (path, data) => fs.writeFile(path, data),
  spawn: nodeSpawn,
  schedule: (fn) => setTimeout(fn, 1000),
};

export class SelfUpdater {
  constructor(private readonly deps: SelfUpdateDeps = defaultDeps) {}

  /** Download, verify and install release `version` for `arch` via `debPath`. */
  async install(version: string, arch: string, debPath: string): Promise<void> {
    const debUrl = debAssetUrl(version, arch);
    log.info("Downloading update", { version, arch, debUrl });

    const artifact = await this.download(debUrl);
    const bundle = await this.downloadBundle(`${debUrl}.sigstore.json`, version);

    try {
      await this.deps.verify(bundle, artifact, {
        certificateIssuer: SIGSTORE_ISSUER,
        certificateIdentityURI: releaseIdentity(version),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`Release v${version} failed signature verification: ${reason}`);
    }
    log.info("Update signature verified", { version, identity: releaseIdentity(version) });

    // Write to the data dir (in ReadWritePaths) instead of /tmp (PrivateTmp) so
    // the systemd-run transient unit can read the file.
    await this.deps.writeFile(debPath, artifact);
    log.info("Installing update", { debPath });

    // dpkg must run outside tomod's ProtectSystem=strict sandbox: a detached
    // child inherits the mount restrictions, a systemd-run transient unit
    // does not. --no-block returns before the service restarts.
    this.deps.schedule(() => {
      const child = this.deps.spawn(
        "systemd-run",
        ["--unit=tomo-update", "--no-block", "--", "dpkg", "-i", debPath],
        { detached: true, stdio: "ignore" },
      );
      child.unref();
    });
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
