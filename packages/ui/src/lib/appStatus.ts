import type { InstalledApp } from "../types";

type Status = InstalledApp["status"];

const BUSY_STATUSES: ReadonlySet<Status> = new Set([
  "installing",
  "starting",
  "restarting",
  "stopping",
]);

/** True while the backend is still changing the app's state. */
export function isBusyStatus(status: Status | undefined): boolean {
  return status !== undefined && BUSY_STATUSES.has(status);
}

/** Translation key describing what an in-flight install is doing right now. */
export function installPhaseKey(status: Status | undefined): string {
  if (status === "installing") return "install.phase.installing";
  if (status === "starting") return "install.phase.starting";
  return "install.phase.preparing";
}
