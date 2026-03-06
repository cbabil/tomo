import Dockerode from "dockerode";
import { execa } from "execa";
import { createLogger } from "./logger.js";

const log = createLogger("docker");

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: Array<{ private: number; public: number; type: string }>;
  created: number;
}

export interface NetworkInfo {
  id: string;
  name: string;
  driver: string;
}

export type PullProgressCallback = (event: {
  status: string;
  progress?: string;
}) => void;

export class Docker {
  private readonly client: Dockerode;

  constructor(socketPath?: string) {
    this.client = new Dockerode({
      socketPath: socketPath ?? "/var/run/docker.sock",
    });
    log.info("Docker client initialized");
  }

  getRawClient(): Dockerode {
    return this.client;
  }

  async listContainers(): Promise<ContainerInfo[]> {
    const containers = await this.client.listContainers({ all: true });
    return containers.map(formatContainer);
  }

  async getContainer(id: string): Promise<ContainerInfo> {
    const container = this.client.getContainer(id);
    const info = await container.inspect();
    return {
      id: info.Id,
      name: info.Name.replace(/^\//, ""),
      image: info.Config.Image,
      status: info.State.Status,
      state: info.State.Status,
      ports: Object.entries(info.NetworkSettings.Ports ?? {}).flatMap(
        ([key, bindings]) => {
          const [portStr, type] = key.split("/");
          return (bindings ?? []).map((b) => ({
            private: parseInt(portStr, 10),
            public: parseInt(b.HostPort, 10),
            type: type ?? "tcp",
          }));
        },
      ),
      created: new Date(info.Created).getTime(),
    };
  }

  async startContainer(id: string): Promise<void> {
    const container = this.client.getContainer(id);
    await container.start();
    log.info("Container started", { id });
  }

  async stopContainer(id: string): Promise<void> {
    const container = this.client.getContainer(id);
    await container.stop();
    log.info("Container stopped", { id });
  }

  async restartContainer(id: string): Promise<void> {
    const container = this.client.getContainer(id);
    await container.restart();
    log.info("Container restarted", { id });
  }

  async removeContainer(id: string): Promise<void> {
    const container = this.client.getContainer(id);
    await container.remove({ force: true });
    log.info("Container removed", { id });
  }

  async pullImage(
    image: string,
    tag: string = "latest",
    onProgress?: PullProgressCallback,
  ): Promise<void> {
    const fullImage = `${image}:${tag}`;
    log.info("Pulling image", { image: fullImage });

    const stream = await this.client.pull(fullImage);
    await new Promise<void>((resolve, reject) => {
      this.client.modem.followProgress(
        stream,
        (err: Error | null) => (err ? reject(err) : resolve()),
        (event: { status: string; progress?: string }) =>
          onProgress?.(event),
      );
    });

    log.info("Image pulled", { image: fullImage });
  }

  async getNetworks(): Promise<NetworkInfo[]> {
    const networks = await this.client.listNetworks();
    return networks.map((n) => ({
      id: n.Id,
      name: n.Name,
      driver: n.Driver ?? "bridge",
    }));
  }

  async createNetwork(name: string): Promise<string> {
    const network = await this.client.createNetwork({ Name: name });
    log.info("Network created", { name, id: network.id });
    return network.id;
  }

  async getContainerLogs(id: string, tail: number = 100): Promise<string> {
    const container = this.client.getContainer(id);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail,
      timestamps: true,
    });
    return logs.toString();
  }

  async composeUp(composePath: string, projectName: string): Promise<void> {
    log.info("Running docker compose up", { composePath, projectName });
    await execa("docker", [
      "compose",
      "-f",
      composePath,
      "-p",
      projectName,
      "up",
      "-d",
    ]);
  }

  async getVersion(): Promise<{ version: string; apiVersion: string }> {
    const info = await this.client.version();
    return { version: info.Version, apiVersion: info.ApiVersion };
  }

  async composeDown(projectName: string): Promise<void> {
    log.info("Running docker compose down", { projectName });
    await execa("docker", ["compose", "-p", projectName, "down"]);
  }

  async pruneUnused(): Promise<void> {
    log.info("Pruning unused Docker resources");
    try {
      const result = await this.client.pruneImages();
      const reclaimedMB = Math.round(
        (result.SpaceReclaimed ?? 0) / 1024 / 1024,
      );
      log.info("Docker prune complete", { reclaimedMB });
    } catch (err) {
      log.warn("Docker prune failed", { error: String(err) });
    }
  }
}

function formatContainer(c: Dockerode.ContainerInfo): ContainerInfo {
  return {
    id: c.Id,
    name: (c.Names[0] ?? "").replace(/^\//, ""),
    image: c.Image,
    status: c.Status,
    state: c.State,
    ports: (c.Ports ?? []).map((p) => ({
      private: p.PrivatePort,
      public: p.PublicPort ?? 0,
      type: p.Type,
    })),
    created: c.Created,
  };
}
