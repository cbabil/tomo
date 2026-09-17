/**
 * Waits until an app is reachable from the Traefik proxy container.
 *
 * `docker compose up` returns as soon as containers are created, but many apps
 * (database migrations, JVM warm-up) only start listening seconds later. Until
 * then Traefik answers 502 Bad Gateway, so apps stay in "starting" until the
 * exact hop Traefik uses (proxy container -> upstream host:port) connects.
 */
import { execa } from "execa";
import { createLogger } from "./logger.js";
import { PROXY_CONTAINER_NAME, upstreamHost } from "./traefik-proxy.js";
import type { ProxyTarget } from "./app.js";

const log = createLogger("upstream-ready");

const MAX_ATTEMPTS = 60;
const CONNECT_TIMEOUT_SECONDS = 1;
/** Hard ceiling on the whole wait, whatever the loop inside the container does. */
const OVERALL_TIMEOUT_MS = 90_000;
const PROXY_MISSING_PATTERN = /no such container|is not running/i;

/**
 * One retry loop run inside the proxy container. Host and port arrive as
 * positional parameters ($1, $2) so they are never parsed as shell code.
 */
const PROBE_SCRIPT = `i=0; while [ "$i" -lt ${MAX_ATTEMPTS} ]; do nc -z -w ${CONNECT_TIMEOUT_SECONDS} "$1" "$2" && exit 0; i=$((i+1)); sleep 1; done; exit 1`;

export type UpstreamState = "ready" | "timeout" | "unavailable";

/** Arguments for `docker` that run the probe loop against host:port. */
export function buildProbeArgs(host: string, port: number): string[] {
  return ["exec", PROXY_CONTAINER_NAME, "sh", "-c", PROBE_SCRIPT, "probe", host, String(port)];
}

/** Interpret the probe's outcome. `exitCode` is undefined when it never ran or was killed. */
export function classifyProbe(result: {
  exitCode?: number;
  stderr?: unknown;
  timedOut?: boolean;
}): UpstreamState {
  if (result.exitCode === 0) return "ready";
  if (result.timedOut) return "timeout";
  if (result.exitCode === undefined || PROXY_MISSING_PATTERN.test(String(result.stderr))) {
    return "unavailable";
  }
  return "timeout";
}

/**
 * Block until the app's proxied port accepts connections. Never throws: a
 * timeout or an unusable proxy is logged and the caller carries on.
 */
export async function waitForApp(appId: string, target: ProxyTarget): Promise<void> {
  const host = upstreamHost(appId, target);
  const result = await execa("docker", buildProbeArgs(host, target.port), {
    reject: false,
    timeout: OVERALL_TIMEOUT_MS,
  });
  const state = classifyProbe(result);
  if (state === "ready") {
    log.info("App is reachable from the proxy", { appId, host, port: target.port });
  } else {
    log.warn("App not confirmed reachable; continuing", { appId, host, port: target.port, state });
  }
}
