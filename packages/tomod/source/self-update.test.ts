import { describe, it, expect, vi } from "vitest";
import { SelfUpdater, releaseIdentity, identityPattern, verifyOptionsFor, debAssetUrl, SIGSTORE_ISSUER, TUF_CACHE_DIR, type SelfUpdateDeps } from "./self-update.js";

const deb = Buffer.from("deb bytes");
const bundle = { mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json" };

// A fake GitHub: serves the .deb and, unless told otherwise, its Sigstore bundle.
function fakeFetch(opts: { bundle?: boolean; debStatus?: number } = {}) {
  return vi.fn(async (url: string) => {
    if (url.endsWith(".sigstore.json")) {
      return opts.bundle === false
        ? new Response("Not Found", { status: 404 })
        : new Response(JSON.stringify(bundle), { status: 200 });
    }
    return new Response(deb, { status: opts.debStatus ?? 200 });
  });
}

function makeDeps(overrides: Partial<SelfUpdateDeps> = {}): SelfUpdateDeps & { writeFile: ReturnType<typeof vi.fn>; spawn: ReturnType<typeof vi.fn> } {
  return {
    fetch: fakeFetch() as unknown as typeof fetch,
    verify: vi.fn(async () => {}),
    writeFile: vi.fn(async () => {}),
    spawn: vi.fn(() => ({ unref: vi.fn() })),
    schedule: (fn: () => void) => fn(),
    ...overrides,
  } as never;
}

describe("release identity", () => {
  it("pins Tomo's release workflow at the exact version tag", () => {
    expect(releaseIdentity("0.0.77")).toBe(
      "https://github.com/cbabil/tomo/.github/workflows/release.yml@refs/tags/v0.0.77",
    );
    expect(SIGSTORE_ISSUER).toBe("https://token.actions.githubusercontent.com");
  });

  it("matches the identity exactly: anchored and escaped, since sigstore treats it as a regex", () => {
    const pattern = identityPattern("0.0.7");
    expect(pattern.startsWith("^")).toBe(true);
    expect(pattern.endsWith("$")).toBe(true);
    expect(new RegExp(pattern).test(releaseIdentity("0.0.7"))).toBe(true);
    expect(new RegExp(pattern).test(releaseIdentity("0.0.78"))).toBe(false);
    expect(new RegExp(pattern).test("https://github.com/cbabil/tomoX.github/workflows/release.yml@refs/tags/v0.0.7")).toBe(false);
  });

  it("keeps the trust-root cache in the data dir, which the hardened unit can write", () => {
    expect(TUF_CACHE_DIR.startsWith("/")).toBe(true);
    expect(verifyOptionsFor("0.0.7")).toEqual({
      certificateIssuer: SIGSTORE_ISSUER,
      certificateIdentityURI: identityPattern("0.0.7"),
      tufCachePath: TUF_CACHE_DIR,
    });
  });

  it("builds the .deb asset URL for the arch", () => {
    expect(debAssetUrl("0.0.77", "arm64")).toBe(
      "https://github.com/cbabil/tomo/releases/download/v0.0.77/tomo_0.0.77_arm64.deb",
    );
  });
});

describe("SelfUpdater.install", () => {
  it("verifies the bundle against the release identity, then writes and installs the .deb", async () => {
    const deps = makeDeps();
    const updater = new SelfUpdater(deps);
    await updater.install("0.0.77", "amd64", "/opt/tomo/data/tomo_update.deb");

    expect(deps.verify).toHaveBeenCalledWith(bundle, deb, verifyOptionsFor("0.0.77"));
    expect(deps.writeFile).toHaveBeenCalledWith("/opt/tomo/data/tomo_update.deb", deb);
    expect(deps.spawn).toHaveBeenCalledWith(
      "systemd-run",
      ["--unit=tomo-update", "--no-block", "--", "dpkg", "-i", "/opt/tomo/data/tomo_update.deb"],
      expect.objectContaining({ detached: true }),
    );
  });

  it("refuses a release that has no signature bundle, and writes nothing", async () => {
    const deps = makeDeps({ fetch: fakeFetch({ bundle: false }) as unknown as typeof fetch });
    await expect(new SelfUpdater(deps).install("0.0.77", "amd64", "/tmp/x.deb"))
      .rejects.toThrow("not signed by Tomo's release pipeline");
    expect(deps.verify).not.toHaveBeenCalled();
    expect(deps.writeFile).not.toHaveBeenCalled();
    expect(deps.spawn).not.toHaveBeenCalled();
  });

  it("refuses a release whose signature does not verify", async () => {
    const deps = makeDeps({ verify: vi.fn(async () => { throw new Error("bad signature"); }) });
    await expect(new SelfUpdater(deps).install("0.0.77", "amd64", "/tmp/x.deb"))
      .rejects.toThrow("failed signature verification: bad signature");
    expect(deps.writeFile).not.toHaveBeenCalled();
    expect(deps.spawn).not.toHaveBeenCalled();
  });

  it("verifies only against the requested version, never another tag", async () => {
    const deps = makeDeps();
    await new SelfUpdater(deps).install("0.0.78", "arm64", "/tmp/x.deb");
    const options = (deps.verify as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(options.certificateIdentityURI).toBe(identityPattern("0.0.78"));
    expect(options.certificateIdentityURI).not.toContain("0.0.77");
  });

  it("rejects a version or arch that is not plain before touching the network", async () => {
    const deps = makeDeps();
    for (const bad of ["0.0.79.|", "0.0.80-rc1", "../x", "0.0.7.8.9"]) {
      await expect(new SelfUpdater(deps).install(bad, "amd64", "/tmp/x.deb")).rejects.toThrow("Refusing to update to");
    }
    await expect(new SelfUpdater(deps).install("0.0.77", "x86", "/tmp/x.deb")).rejects.toThrow("Refusing to update to");
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it("fails when the .deb itself cannot be downloaded", async () => {
    const deps = makeDeps({ fetch: fakeFetch({ debStatus: 500 }) as unknown as typeof fetch });
    await expect(new SelfUpdater(deps).install("0.0.77", "amd64", "/tmp/x.deb"))
      .rejects.toThrow("Failed to download .deb: 500");
    expect(deps.verify).not.toHaveBeenCalled();
  });
});
