import { readFile, mkdir, chown, readdir } from "node:fs/promises";
import path from "node:path";

export async function prepareVolumeDirectories(
  appDir: string,
  content: string,
): Promise<void> {
  const { uid, gid } = extractContainerUser(content);

  const matches = content.matchAll(/\$\{?APP_DATA_DIR\}?\/([^\s:]+)/g);
  const subdirs = new Set(Array.from(matches, (m) => m[1]));

  await Promise.all(
    Array.from(subdirs).map(async (subdir) => {
      const fullPath = path.join(appDir, subdir);
      await mkdir(fullPath, { recursive: true });
      await chownRecursive(fullPath, uid, gid);
    }),
  );
}

export async function fixVolumePermissions(appDir: string): Promise<void> {
  const composePath = path.join(appDir, "docker-compose.yml");
  try {
    const content = await readFile(composePath, "utf-8");
    await prepareVolumeDirectories(appDir, content);
  } catch {
    // Compose file may not exist yet
  }
}

function extractContainerUser(content: string): {
  uid: number;
  gid: number;
} {
  const userMatch = /^\s+user:\s*["']?(\d+):(\d+)["']?/m.exec(content);
  if (userMatch) {
    return {
      uid: parseInt(userMatch[1], 10),
      gid: parseInt(userMatch[2], 10),
    };
  }

  const uid = extractEnvInt(content, "PUID") ?? 1000;
  const gid = extractEnvInt(content, "PGID") ?? 1000;
  return { uid, gid };
}

function extractEnvInt(content: string, name: string): number | undefined {
  const re = new RegExp(`${name}[=:]\\s*(?:['"]?)(\\d+)(?:['"]?)`, "m");
  const m = re.exec(content);
  return m ? parseInt(m[1], 10) : undefined;
}

async function chownRecursive(
  dirPath: string,
  uid: number,
  gid: number,
): Promise<void> {
  await chown(dirPath, uid, gid);
  const entries = await readdir(dirPath, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await chownRecursive(fullPath, uid, gid);
      } else {
        await chown(fullPath, uid, gid);
      }
    }),
  );
}
