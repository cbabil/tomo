import fs from "node:fs/promises";
import { router, privateProcedure } from "./middleware.js";
import { TOMO_VERSION } from "../config.js";
import { createLogger } from "../logger.js";
import { execa } from "execa";
import type { Hardware } from "../hardware.js";
import type { Docker } from "../docker.js";

const log = createLogger("system");

const GITHUB_RELEASE_URL =
  "https://api.github.com/repos/cbabil/tomo/releases/latest";

interface GitHubRelease {
  tag_name: string;
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(GITHUB_RELEASE_URL, {
      headers: { Accept: "application/vnd.github.v3+json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GitHubRelease;
    return data.tag_name.replace(/^v/, "");
  } catch {
    return null;
  }
}

export function createSystemRouter(hardware: Hardware, docker: Docker) {
  return router({
    stats: privateProcedure.query(async () => {
      const [cpuInfo, memory, disks, sysInfo] = await Promise.all([
        hardware.getCpuUsage(),
        hardware.getMemoryUsage(),
        hardware.getDiskUsage(),
        hardware.getSystemInfo(),
      ]);
      const rootDisk = disks.find((d) => d.mount === "/") ?? disks[0];
      return {
        cpu: Math.round(cpuInfo.currentLoad),
        memory: { used: memory.used, total: memory.total },
        disk: rootDisk
          ? { used: rootDisk.used, total: rootDisk.size }
          : { used: 0, total: 0 },
        uptime: sysInfo.uptime,
      };
    }),

    info: privateProcedure.query(async () => {
      return hardware.getSystemInfo();
    }),

    docker: privateProcedure.query(async () => {
      const [version, containers] = await Promise.all([
        docker.getVersion(),
        docker.listContainers(),
      ]);
      const running = containers.filter((c) => c.state === "running").length;
      return {
        version: version.version,
        apiVersion: version.apiVersion,
        containers: { total: containers.length, running },
      };
    }),

    version: privateProcedure.query(async () => {
      const latest = await fetchLatestVersion();
      return {
        current: TOMO_VERSION,
        latest,
        updateAvailable: latest !== null && latest !== TOMO_VERSION,
      };
    }),

    update: privateProcedure.mutation(async () => {
      const latest = await fetchLatestVersion();
      if (!latest) {
        throw new Error("Could not fetch latest version from GitHub");
      }
      if (latest === TOMO_VERSION) {
        return { success: true, version: TOMO_VERSION };
      }

      const arch = process.arch === "arm64" ? "arm64" : "amd64";
      const debUrl = `https://github.com/cbabil/tomo/releases/download/v${latest}/tomo_${latest}_${arch}.deb`;
      const debPath = "/tmp/tomo_update.deb";

      log.info("Downloading update", { version: latest, arch, debUrl });

      const res = await fetch(debUrl, {
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        throw new Error(`Failed to download .deb: ${res.status}`);
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(debPath, buffer);

      log.info("Installing update", { debPath });

      // Run dpkg in background after a short delay so the response
      // can be sent before the service restarts
      setTimeout(() => {
        execa("dpkg", ["-i", debPath], { detached: true, stdio: "ignore" })
          .catch((err) => log.error("Update install failed", { error: String(err) }));
      }, 1000);

      return { success: true, version: latest };
    }),
  });
}
