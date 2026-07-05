import type { InstalledApp } from "../types";

export function appUrl(webPort: number | undefined): string | null {
  if (webPort == null) return null;
  return `${window.location.protocol}//${window.location.hostname}:${webPort}/`;
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
