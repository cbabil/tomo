import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { colors } from "../../app/theme";
import { trpc } from "../../lib/trpc";
import { openInstalledApp } from "../../lib/urls";
import { isBusyStatus } from "../../lib/appStatus";
import { useStore } from "../../hooks/useStore";
import { AppIcon } from "../ui/AppIcon";
import { ConfirmDialog } from "../dialogs/ConfirmDialog";
import { AppContextMenu, type AppAction } from "./AppContextMenu";
import type { InstalledApp } from "../../types";

// While any app is installing, starting or stopping, keep the tiles live.
const BUSY_POLL_INTERVAL_MS = 2000;

export function AppGrid() {
  const { t } = useTranslation();
  const openSheet = useStore((s) => s.openSheet);
  const openEditExternalApp = useStore((s) => s.openEditExternalApp);
  const openEditCustomApp = useStore((s) => s.openEditCustomApp);
  const openLogs = useStore((s) => s.openLogs);
  const startMutation = trpc.apps.start.useMutation();
  const stopMutation = trpc.apps.stop.useMutation();
  const restartMutation = trpc.apps.restart.useMutation();
  const updateMutation = trpc.apps.update.useMutation();
  const uninstallMutation = trpc.apps.uninstall.useMutation();
  const removeExternalMutation = trpc.apps.custom.removeExternal.useMutation();
  const lifecyclePending = [startMutation, stopMutation, restartMutation, updateMutation]
    .some((m) => m.isPending);
  // The server flips an app to a busy status as soon as a request starts, so
  // poll while one is in flight and for as long as anything stays busy.
  const installedQuery = trpc.apps.installed.useQuery(undefined, {
    refetchInterval: (query) =>
      lifecyclePending || query.state.data?.some((app) => isBusyStatus(app.status))
        ? BUSY_POLL_INTERVAL_MS
        : false,
  });

  const [contextMenu, setContextMenu] = useState<{
    anchor: HTMLElement;
    app: InstalledApp;
  } | null>(null);
  const [removing, setRemoving] = useState<InstalledApp | null>(null);

  // System apps (e.g. the Terminal, opened from the dock) are hidden from the grid.
  const apps = (installedQuery.data ?? []).filter((app) => !app.hidden);

  /** Run a change to an app, then show its result. */
  const run = async (change: Promise<unknown>) => {
    try {
      await change;
    } catch {
      // Mutation errors are surfaced via the mutation's error state
    }
    await installedQuery.refetch();
  };

  const handleAction = (action: AppAction) => {
    if (!contextMenu) return;
    const { app } = contextMenu;
    setContextMenu(null);

    if (action === "logs") return openLogs({ id: app.id, name: app.name });
    if (action === "remove") return setRemoving(app);
    if (action === "edit" && app.type === "external") {
      return openEditExternalApp({
        id: app.id,
        name: app.name,
        url: app.externalUrl ?? "",
        icon: app.icon || undefined,
      });
    }
    if (action === "edit") {
      return openEditCustomApp({
        id: app.id,
        name: app.name,
        type: app.type,
        path: app.webPath,
        icon: app.icon || undefined,
        ownAuth: app.ownAuth,
        source: app.source,
      });
    }

    const mutations = {
      start: startMutation,
      stop: stopMutation,
      restart: restartMutation,
      update: updateMutation,
    };
    void run(mutations[action].mutateAsync({ appId: app.id }));
  };

  const handleConfirmRemove = async () => {
    if (!removing) return;
    await run(
      removing.type === "external"
        ? removeExternalMutation.mutateAsync({ id: removing.id })
        : uninstallMutation.mutateAsync({ appId: removing.id }),
    );
    setRemoving(null);
  };

  if (apps.length === 0) {
    return (
      <Box sx={styles.empty}>
        <Typography sx={styles.emptyText}>
          {t("desktop.apps.empty")}
        </Typography>
        <Typography
          sx={styles.emptyLink}
          onClick={() => openSheet("appStore")}
        >
          {t("desktop.apps.installFirst")}
        </Typography>
      </Box>
    );
  }

  return (
    <>
      <Box sx={styles.grid}>
        {apps.map((app) => (
          <AppIcon
            key={app.id}
            name={app.name}
            icon={app.icon}
            status={app.status}
            onClick={() => openInstalledApp(app)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ anchor: e.currentTarget, app });
            }}
          />
        ))}
      </Box>

      <AppContextMenu
        anchor={contextMenu?.anchor ?? null}
        app={contextMenu?.app ?? null}
        onClose={() => setContextMenu(null)}
        onAction={handleAction}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        title={t("desktop.apps.removeTitle", { name: removing?.name })}
        message={t(
          removing?.type === "external"
            ? "desktop.apps.removeExternalWarning"
            : "desktop.apps.removeWarning",
          { name: removing?.name },
        )}
        confirmLabel={t("desktop.apps.remove")}
        destructive
        pending={uninstallMutation.isPending || removeExternalMutation.isPending}
        onConfirm={handleConfirmRemove}
        onClose={() => setRemoving(null)}
      />
    </>
  );
}

const styles = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, 80px)",
    gap: 1,
  },
  empty: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  emptyText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: "1.1rem",
  },
  emptyLink: {
    color: "primary.main",
    cursor: "pointer",
    "&:hover": { color: colors.iconHover },
  },
};
