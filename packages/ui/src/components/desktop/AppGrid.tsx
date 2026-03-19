import { useState } from "react";
import Box from "@mui/material/Box";
import { colors } from "../../app/theme";
import Typography from "@mui/material/Typography";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import IconButton from "@mui/material/IconButton";
import StopIcon from "@mui/icons-material/Stop";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import { useTranslation } from "react-i18next";
import { trpc } from "../../lib/trpc";
import { openInstalledApp } from "../../lib/urls";
import { useStore } from "../../hooks/useStore";
import { AppIcon } from "../ui/AppIcon";
import type { InstalledApp } from "../../types";

export function AppGrid() {
  const { t } = useTranslation();
  const openSheet = useStore((s) => s.openSheet);
  const openCustomAppDialog = useStore((s) => s.openCustomAppDialog);
  const openEditExternalApp = useStore((s) => s.openEditExternalApp);
  const installedQuery = trpc.apps.installed.useQuery();
  const stopMutation = trpc.apps.stop.useMutation();
  const restartMutation = trpc.apps.restart.useMutation();
  const uninstallMutation = trpc.apps.uninstall.useMutation();
  const removeExternalMutation = trpc.apps.custom.removeExternal.useMutation();

  const [contextMenu, setContextMenu] = useState<{
    anchor: HTMLElement;
    app: InstalledApp;
  } | null>(null);

  const apps = installedQuery.data ?? [];

  const handleContextMenu = (
    event: React.MouseEvent<HTMLElement>,
    app: InstalledApp,
  ) => {
    event.preventDefault();
    setContextMenu({ anchor: event.currentTarget, app });
  };

  const handleAction = async (action: "stop" | "restart" | "remove" | "edit") => {
    if (!contextMenu) return;
    const { app } = contextMenu;
    setContextMenu(null);

    if (action === "edit" && app.type === "external") {
      openEditExternalApp({
        id: app.id,
        name: app.name,
        url: app.externalUrl ?? "",
        icon: app.icon || undefined,
      });
      return;
    }

    try {
      if (action === "stop") {
        await stopMutation.mutateAsync({ appId: app.id });
      } else if (action === "restart") {
        await restartMutation.mutateAsync({ appId: app.id });
      } else if (action === "remove" && app.type === "external") {
        await removeExternalMutation.mutateAsync({ id: app.id });
      } else if (action === "remove") {
        await uninstallMutation.mutateAsync({ appId: app.id });
      }
      await installedQuery.refetch();
    } catch {
      // Mutation errors are surfaced via the mutation's error state
    }
  };

  const handleOpen = (app: InstalledApp) => {
    openInstalledApp(app);
  };

  const isExternal = contextMenu?.app.type === "external";

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
            onClick={() => handleOpen(app)}
            onContextMenu={(e) => handleContextMenu(e, app)}
          />
        ))}
        <Box sx={styles.addButton}>
          <IconButton onClick={openCustomAppDialog} sx={styles.addIcon}>
            <AddIcon />
          </IconButton>
          <Typography variant="caption" sx={styles.addLabel} noWrap>
            {t("desktop.apps.addCustom")}
          </Typography>
        </Box>
      </Box>

      <Menu
        open={Boolean(contextMenu)}
        anchorEl={contextMenu?.anchor}
        onClose={() => setContextMenu(null)}
        slotProps={{
          paper: { sx: styles.menuPaper },
        }}
      >
        {isExternal ? (
          <>
            <MenuItem onClick={() => handleAction("edit")}>
              <ListItemIcon>
                <EditIcon fontSize="small" sx={{ color: "text.secondary" }} />
              </ListItemIcon>
              <ListItemText>{t("desktop.apps.edit")}</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => handleAction("remove")}>
              <ListItemIcon>
                <DeleteOutlineIcon fontSize="small" sx={{ color: "error.main" }} />
              </ListItemIcon>
              <ListItemText sx={{ color: "error.main" }}>
                {t("desktop.apps.remove")}
              </ListItemText>
            </MenuItem>
          </>
        ) : (
          <>
            <MenuItem onClick={() => handleAction("stop")}>
              <ListItemIcon>
                <StopIcon fontSize="small" sx={{ color: "text.secondary" }} />
              </ListItemIcon>
              <ListItemText>{t("desktop.apps.stop")}</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => handleAction("restart")}>
              <ListItemIcon>
                <RestartAltIcon fontSize="small" sx={{ color: "text.secondary" }} />
              </ListItemIcon>
              <ListItemText>{t("desktop.apps.restart")}</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => handleAction("remove")}>
              <ListItemIcon>
                <DeleteOutlineIcon fontSize="small" sx={{ color: "error.main" }} />
              </ListItemIcon>
              <ListItemText sx={{ color: "error.main" }}>
                {t("desktop.apps.remove")}
              </ListItemText>
            </MenuItem>
          </>
        )}
      </Menu>
    </>
  );
}

const styles = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, 80px)",
    gap: 1,
  },
  addButton: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 0.5,
    p: 1,
  },
  addIcon: {
    width: 56,
    height: 56,
    border: "2px dashed rgba(255,255,255,0.2)",
    borderRadius: 3,
    color: "rgba(255,255,255,0.4)",
    "&:hover": {
      borderColor: colors.primary,
      color: colors.primary,
      backgroundColor: "transparent",
    },
  },
  addLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: "0.7rem",
    textAlign: "center" as const,
    maxWidth: 72,
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
  menuPaper: {
    backgroundColor: colors.surface,
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 2,
  },
};
