import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "../lib/trpc";
import { installPhaseKey } from "../lib/appStatus";

const POLL_INTERVAL_MS = 1500;

/**
 * Describes what an in-flight install is doing. The install request only
 * returns once the app is reachable, so while it is pending this polls the
 * installed list, where the new app already appears with its current phase.
 *
 * @param active true while the install request is pending
 * @param appId  id of the app being installed, when the caller knows it. Custom
 *   and template installs get their id from the server, so for those the app is
 *   recognised as the one that was not in the list when the install began.
 * @returns a status line to show, or undefined when no install is running
 */
export function useInstallPhase(active: boolean, appId?: string): string | undefined {
  const { t } = useTranslation();
  const installedQuery = trpc.apps.installed.useQuery(undefined, {
    enabled: active,
    refetchInterval: active ? POLL_INTERVAL_MS : false,
  });
  const knownIds = useRef<Set<string> | null>(null);

  if (!active) {
    knownIds.current = null;
    return undefined;
  }
  const apps = installedQuery.data ?? [];
  if (knownIds.current === null && installedQuery.data) {
    knownIds.current = new Set(apps.map((a) => a.id));
  }
  const app = appId
    ? apps.find((a) => a.id === appId)
    : apps.find((a) => knownIds.current !== null && !knownIds.current.has(a.id));
  return t(installPhaseKey(app?.status));
}
