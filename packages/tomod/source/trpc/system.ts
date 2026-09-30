import { router, privateProcedure, userProcedure } from "./middleware.js";
import { TOMO_VERSION } from "../config.js";
import type { Hardware } from "../hardware.js";
import type { Docker } from "../docker.js";
import { ReleaseFeed, releaseStatus } from "../releases.js";
import { SelfUpdater } from "../self-update.js";

export function createSystemRouter(hardware: Hardware, docker: Docker) {
  const feed = new ReleaseFeed();
  const updater = new SelfUpdater();
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

      // Downloads, verifies the release signature (refuses unsigned or
      // tampered releases) and installs via systemd-run + dpkg.
      await updater.install(latest);

      return { success: true, version: latest };
    }),
  });
}
