/** Filesystem helpers shared by the stores that persist Tomo's state. */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Write a file so readers see either the old content or the new, never a
 * partial file: write to a temporary sibling, then rename over the target.
 * The file is owner-only, since these stores hold configuration and secrets.
 */
export async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tmpPath = path.join(dir, `.tomo-${crypto.randomBytes(16).toString("hex")}.tmp`);
  await writeFile(tmpPath, content, { encoding: "utf-8", mode: 0o600 });
  await rename(tmpPath, filePath);
}

/**
 * Read a file that may not exist yet. Absent means undefined; any other
 * failure is logged through `onError` and also yields undefined.
 */
export async function readOptionalFile(filePath: string, onError: (error: string) => void): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") onError(String(err));
    return undefined;
  }
}
