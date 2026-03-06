import si from "systeminformation";
import { createLogger } from "./logger.js";

const log = createLogger("hardware");

export interface CpuUsage {
  currentLoad: number;
  cores: number[];
}

export interface MemoryUsage {
  total: number;
  used: number;
  free: number;
  percentage: number;
}

export interface DiskUsage {
  filesystem: string;
  size: number;
  used: number;
  available: number;
  percentage: number;
  mount: string;
}

export interface SystemInfo {
  hostname: string;
  os: string;
  platform: string;
  uptime: number;
  kernel: string;
}

export interface NetworkStat {
  iface: string;
  rxBytes: number;
  txBytes: number;
  rxSec: number;
  txSec: number;
}

export interface AllStats {
  cpu: CpuUsage;
  memory: MemoryUsage;
  disk: DiskUsage[];
  system: SystemInfo;
  network: NetworkStat[];
}

export class Hardware {
  async getCpuUsage(): Promise<CpuUsage> {
    const load = await si.currentLoad();
    return {
      currentLoad: load.currentLoad,
      cores: load.cpus.map((c) => c.load),
    };
  }

  async getMemoryUsage(): Promise<MemoryUsage> {
    const mem = await si.mem();
    return {
      total: mem.total,
      used: mem.used,
      free: mem.free,
      percentage: (mem.used / mem.total) * 100,
    };
  }

  async getDiskUsage(): Promise<DiskUsage[]> {
    const disks = await si.fsSize();
    return disks.map((d) => ({
      filesystem: d.fs,
      size: d.size,
      used: d.used,
      available: d.available,
      percentage: d.use,
      mount: d.mount,
    }));
  }

  async getSystemInfo(): Promise<SystemInfo> {
    const [osInfo, time] = await Promise.all([si.osInfo(), si.time()]);
    return {
      hostname: osInfo.hostname,
      os: `${osInfo.distro} ${osInfo.release}`,
      platform: osInfo.platform,
      uptime: time.uptime,
      kernel: osInfo.kernel,
    };
  }

  async getNetworkStats(): Promise<NetworkStat[]> {
    const stats = await si.networkStats();
    return stats.map((s) => ({
      iface: s.iface,
      rxBytes: s.rx_bytes,
      txBytes: s.tx_bytes,
      rxSec: s.rx_sec,
      txSec: s.tx_sec,
    }));
  }

  async getAllStats(): Promise<AllStats> {
    log.debug("Gathering all system stats");
    const [cpu, memory, disk, system, network] = await Promise.all([
      this.getCpuUsage(),
      this.getMemoryUsage(),
      this.getDiskUsage(),
      this.getSystemInfo(),
      this.getNetworkStats(),
    ]);
    return { cpu, memory, disk, system, network };
  }
}
