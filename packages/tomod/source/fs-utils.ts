/** Filesystem helpers shared by the stores that persist Tomo's state. */
import { mkdir, rename, writeFile } from "node:fs/promises";
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
