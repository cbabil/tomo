import { useMemo } from "react";
import { trpc } from "../lib/trpc";

/** Installed apps as pick-list options and as an id-to-name lookup. */
export function useAppNames() {
  const installed = trpc.apps.installed.useQuery();
  return useMemo(() => {
    const options = (installed.data ?? []).map((app) => ({ id: app.id, name: app.name }));
    return { options, names: Object.fromEntries(options.map((o) => [o.id, o.name])) as Record<string, string> };
  }, [installed.data]);
}
