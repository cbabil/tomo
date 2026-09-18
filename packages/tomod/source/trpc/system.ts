import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { router, privateProcedure, userProcedure } from "./middleware.js";
import { TOMO_VERSION } from "../config.js";
import { createLogger } from "../logger.js";
import type { Hardware } from "../hardware.js";
import type { Docker } from "../docker.js";
import { ReleaseFeed, releaseStatus } from "../releases.js";

const log = createLogger("system");

export function createSystemRouter(hardware: Hardware, docker: Docker) {
  const feed = new ReleaseFeed();
  const status = async (force = false) => ({
    current: TOMO_VERSION,
    ...releaseStatus(await feed.list(force), TOMO_VERSION),
    checkedAt: feed.checkedAt(),
  });

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

    version: privateProcedure.query(() => status()),

    /** Ask GitHub again now, skipping the cache. */
    checkForUpdates: userProcedure.mutation(() => status(true)),

    update: userProcedure.mutation(async () => {
      const { latest, updateAvailable } = await status();
      if (!latest) {
        throw new Error("Could not fetch latest version from GitHub");
      }
      if (!updateAvailable) {
        return { success: true, version: TOMO_VERSION };
      }

      const arch = process.arch === "arm64" ? "arm64" : "amd64";
      const debUrl = `https://github.com/cbabil/tomo/releases/download/v${latest}/tomo_${latest}_${arch}.deb`;
      // Write to /opt/tomo/data/ (in ReadWritePaths) instead of /tmp (PrivateTmp)
      // so the systemd-run transient unit can access the file.
      const debPath = "/opt/tomo/data/tomo_update.deb";

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

      // Use systemd-run to execute dpkg outside tomod's ProtectSystem=strict sandbox.
      // A detached child inherits the parent's mount namespace restrictions, so dpkg
      // cannot write to /opt/tomo/. systemd-run creates a transient unit with full
      // filesystem access. The --no-block flag returns immediately so we can respond
      // before the service restarts.
      setTimeout(() => {
        const child = spawn("systemd-run", [
          "--unit=tomo-update",
          "--no-block",
          "--",
          "dpkg", "-i", debPath,
        ], {
          detached: true,
          stdio: "ignore",
        });
        child.unref();
      }, 1000);

      return { success: true, version: latest };
    }),
  });
}
