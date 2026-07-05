import type { InstalledApp } from "../types";

export function appUrl(webPort: number | undefined): string | null {
  if (webPort == null) return null;
  return `${window.location.protocol}//${window.location.hostname}:${webPort}/`;
}

/** ttyd WebSocket endpoint for an app served on the given web port. */
export function terminalSocketUrl(webPort: number | undefined): string | null {
  if (webPort == null) return null;
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${window.location.hostname}:${webPort}/ws`;
}

export function openAppUrl(webPort: number | undefined): void {
  const url = appUrl(webPort);
  if (url) window.open(url, "_blank");
}

export function openInstalledApp(app: InstalledApp): void {
  if (app.type === "external" && app.externalUrl) {
    // Only allow http/https to prevent javascript: and data: scheme attacks
    if (/^https?:\/\//i.test(app.externalUrl)) {
      window.open(app.externalUrl, "_blank");
    }
  } else {
    openAppUrl(app.webPort);
  }
}
