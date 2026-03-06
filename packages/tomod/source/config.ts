import fs from "node:fs";
import path from "node:path";

/** Tomo version read from VERSION file or package.json in working directory */
function readVersion(): string {
  const versionFile = path.resolve("VERSION");
  if (fs.existsSync(versionFile)) {
    return fs.readFileSync(versionFile, "utf8").trim();
  }
  const pkgFile = path.resolve("package.json");
  if (fs.existsSync(pkgFile)) {
    const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8")) as {
      version: string;
    };
    return pkg.version;
  }
  return "0.0.0";
}

export const TOMO_VERSION: string = readVersion();

/** Project root for resolving relative paths */
const PROJECT_ROOT = process.env.TOMO_PROJECT_ROOT ?? process.cwd();

function resolve(dir: string): string {
  return path.isAbsolute(dir) ? dir : path.resolve(PROJECT_ROOT, dir);
}

/** Data directory for config, secrets, app data */
export const TOMO_DATA_DIR = resolve(process.env.TOMO_DATA_DIR ?? "/data");

/** HTTP server port */
export const PORT = parseInt(process.env.PORT ?? "80", 10);

/** Directory containing the built frontend static files */
export const STATIC_DIR = resolve(process.env.STATIC_DIR ?? "/app");

/** CORS origin for development (optional) */
export const CORS_ORIGIN = process.env.CORS_ORIGIN;

/** Log level: debug, info, warn, error */
export const LOG_LEVEL = (process.env.LOG_LEVEL ?? "info") as
  | "debug"
  | "info"
  | "warn"
  | "error";

/** Cookie name used for auth token */
export const AUTH_COOKIE_NAME = "tomo_token";

/** Docker network name for app containers */
export const DOCKER_NETWORK_NAME = "tomo_main";

/** Port range for per-app Traefik entrypoints */
export const APP_PORT_MIN = 8001;
export const APP_PORT_MAX = 8099;
