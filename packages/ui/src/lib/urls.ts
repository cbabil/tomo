export function openAppUrl(webPort: number | undefined): void {
  if (webPort == null) return;
  const url = `${window.location.protocol}//${window.location.hostname}:${webPort}/`;
  window.open(url, "_blank");
}
