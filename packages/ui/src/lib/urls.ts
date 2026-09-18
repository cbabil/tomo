import type { InstalledApp } from "../types";
import { isBusyStatus } from "./appStatus";

/**
 * URL of an app served on `webPort`. `webPath` is where its web UI lives when
 * that is not "/" (validated server-side to be a plain path such as "/ui").
 */
export function appUrl(
  webPort: number | undefined,
  webPath: string = "/",
): string | null {
  if (webPort == null) return null;
  return `${window.location.protocol}//${window.location.hostname}:${webPort}${webPath}`;
}

/** ttyd WebSocket endpoint for an app served on the given web port. */
export function terminalSocketUrl(webPort: number | undefined): string | null {
  if (webPort == null) return null;
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${window.location.hostname}:${webPort}/ws`;
}

export function openAppUrl(webPort: number | undefined, webPath?: string): void {
  const url = appUrl(webPort, webPath);
  if (url) window.open(url, "_blank");
}

export function openInstalledApp(app: InstalledApp): void {
  // An app that is still coming up would only show a gateway error.
  if (isBusyStatus(app.status)) return;
  if (app.type === "external" && app.externalUrl) {
    // Only allow http/https to prevent javascript: and data: scheme attacks
    if (/^https?:\/\//i.test(app.externalUrl)) {
      window.open(app.externalUrl, "_blank");
    }
  } else {
    openAppUrl(app.webPort, app.webPath);
  }
}
