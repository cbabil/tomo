import { describe, it, expect, vi } from "vitest";
import { SelfUpdater, VERIFY_OPTIONS, TUF_CACHE_DIR, UPDATE_DEB_PATH, type SelfUpdateDeps } from "./self-update.js";

const deb = Buffer.from("deb bytes");
const bundle = { mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json" };
const identity = (version: string) => `https://github.com/cbabil/tomo/.github/workflows/release.yml@refs/tags/v${version}`;

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

// A fake sigstore: reports the signer the release pipeline would be.
const signedBy = (subjectAlternativeName: string) => vi.fn(async () => ({ identity: { subjectAlternativeName } }));

function makeDeps(overrides: Partial<SelfUpdateDeps> = {}): SelfUpdateDeps & { fetch: ReturnType<typeof vi.fn>; writeFile: ReturnType<typeof vi.fn>; spawn: ReturnType<typeof vi.fn> } {
  return {
    arch: "amd64",
    fetch: fakeFetch() as unknown as typeof fetch,
    verify: signedBy(identity("0.0.77")),
    writeFile: vi.fn(async () => {}),
    spawn: vi.fn(() => ({ unref: vi.fn() })),
    schedule: (fn: () => void) => fn(),
    ...overrides,
  } as never;
}

describe("verification policy", () => {
  it("accepts only GitHub Actions' issuer and keeps the trust-root cache in the data dir", () => {
    expect(VERIFY_OPTIONS).toEqual({ certificateIssuer: "https://token.actions.githubusercontent.com", tufCachePath: TUF_CACHE_DIR });
    expect(TUF_CACHE_DIR.startsWith("/")).toBe(true);
    expect(UPDATE_DEB_PATH.endsWith("/tomo_update.deb")).toBe(true);
  });
});

describe("SelfUpdater.install", () => {
  it("downloads the release's bundle and .deb for this host, verifies, then writes and installs", async () => {
    const deps = makeDeps({ arch: "arm64", verify: signedBy(identity("0.0.77")) });
    await new SelfUpdater(deps).install("0.0.77");

    expect(deps.fetch.mock.calls.map((c) => c[0])).toEqual([
      "https://github.com/cbabil/tomo/releases/download/v0.0.77/tomo_0.0.77_arm64.deb.sigstore.json",
      "https://github.com/cbabil/tomo/releases/download/v0.0.77/tomo_0.0.77_arm64.deb",
    ]);
    expect(deps.verify).toHaveBeenCalledWith(bundle, deb, VERIFY_OPTIONS);
    expect(deps.writeFile).toHaveBeenCalledWith(UPDATE_DEB_PATH, deb);
    expect(deps.spawn).toHaveBeenCalledWith(
      "systemd-run",
      ["--unit=tomo-update", "--no-block", "--", "dpkg", "-i", UPDATE_DEB_PATH],
      expect.objectContaining({ detached: true }),
    );
  });

  it("refuses a release that has no signature bundle, before downloading the .deb", async () => {
    const deps = makeDeps({ fetch: fakeFetch({ bundle: false }) as unknown as typeof fetch });
    await expect(new SelfUpdater(deps).install("0.0.77")).rejects.toThrow("not signed by Tomo's release pipeline");
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    expect(deps.verify).not.toHaveBeenCalled();
    expect(deps.writeFile).not.toHaveBeenCalled();
    expect(deps.spawn).not.toHaveBeenCalled();
  });

  it("refuses a release whose signature does not verify", async () => {
    const deps = makeDeps({ verify: vi.fn(async () => { throw new Error("bad signature"); }) });
    await expect(new SelfUpdater(deps).install("0.0.77")).rejects.toThrow("failed signature verification: bad signature");
    expect(deps.writeFile).not.toHaveBeenCalled();
    expect(deps.spawn).not.toHaveBeenCalled();
  });

  it.each([
    ["another tag", identity("0.0.78")],
    ["another workflow", "https://github.com/cbabil/tomo/.github/workflows/ci.yml@refs/tags/v0.0.77"],
    ["a branch", "https://github.com/cbabil/tomo/.github/workflows/release.yml@refs/heads/dev"],
    ["another repository", "https://github.com/someone/tomo/.github/workflows/release.yml@refs/tags/v0.0.77"],
  ])("refuses a signer from %s", async (_what, other) => {
    const deps = makeDeps({ verify: signedBy(other) });
    await expect(new SelfUpdater(deps).install("0.0.77")).rejects.toThrow(`was signed by "${other}"`);
    expect(deps.writeFile).not.toHaveBeenCalled();
  });

  it("refuses a signer with no identity", async () => {
    const deps = makeDeps({ verify: vi.fn(async () => ({})) });
    await expect(new SelfUpdater(deps).install("0.0.77")).rejects.toThrow("unknown");
    expect(deps.writeFile).not.toHaveBeenCalled();
  });

  it("rejects a version or arch that is not plain before touching the network", async () => {
    const deps = makeDeps();
    for (const bad of ["0.0.79.|", "0.0.80-rc1", "../x", "0.0.7.8.9"]) {
      await expect(new SelfUpdater(deps).install(bad)).rejects.toThrow("Refusing to update to");
    }
    await expect(new SelfUpdater(makeDeps({ arch: "x86" })).install("0.0.77")).rejects.toThrow("Refusing to update to");
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it("fails when the .deb itself cannot be downloaded", async () => {
    const deps = makeDeps({ fetch: fakeFetch({ debStatus: 500 }) as unknown as typeof fetch });
    await expect(new SelfUpdater(deps).install("0.0.77")).rejects.toThrow("Failed to download .deb: 500");
    expect(deps.verify).not.toHaveBeenCalled();
  });
});
