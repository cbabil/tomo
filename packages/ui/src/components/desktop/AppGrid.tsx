import { useState } from "react";
import Box from "@mui/material/Box";
import { colors } from "../../app/theme";
import Typography from "@mui/material/Typography";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import StopIcon from "@mui/icons-material/Stop";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useTranslation } from "react-i18next";
import { trpc } from "../../lib/trpc";
import { openAppUrl } from "../../lib/urls";
import { useStore } from "../../hooks/useStore";
import { AppIcon } from "../ui/AppIcon";
import type { InstalledApp } from "../../types";

export function AppGrid() {
  const { t } = useTranslation();
  const openSheet = useStore((s) => s.openSheet);
  const installedQuery = trpc.apps.installed.useQuery();
  const stopMutation = trpc.apps.stop.useMutation();
  const restartMutation = trpc.apps.restart.useMutation();
  const uninstallMutation = trpc.apps.uninstall.useMutation();

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

  const handleAction = async (action: "stop" | "restart" | "remove") => {
    if (!contextMenu) return;
    const { app } = contextMenu;
    setContextMenu(null);

    try {
      if (action === "stop") {
        await stopMutation.mutateAsync({ appId: app.id });
      } else if (action === "restart") {
        await restartMutation.mutateAsync({ appId: app.id });
      } else {
        await uninstallMutation.mutateAsync({ appId: app.id });
      }
      await installedQuery.refetch();
    } catch {
      // Mutation errors are surfaced via the mutation's error state
    }
  };

  const handleOpen = (app: InstalledApp) => {
    openAppUrl(app.webPort);
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
            onClick={() => handleOpen(app)}
            onContextMenu={(e) => handleContextMenu(e, app)}
          />
        ))}
      </Box>

      <Menu
        open={Boolean(contextMenu)}
        anchorEl={contextMenu?.anchor}
        onClose={() => setContextMenu(null)}
        slotProps={{
          paper: { sx: styles.menuPaper },
        }}
      >
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
