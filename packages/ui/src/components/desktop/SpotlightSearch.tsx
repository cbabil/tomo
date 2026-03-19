import { useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Command } from "cmdk";
import { useTranslation } from "react-i18next";
import { trpc } from "../../lib/trpc";
import { useStore } from "../../hooks/useStore";
import { openInstalledApp } from "../../lib/urls";
import { colors } from "../../app/theme";
import { AppIconFallback } from "../ui/AppIconFallback";
import { STATUS_COLORS } from "../ui/AppIcon";
import type { InstalledApp, Sheet } from "../../types";

export function SpotlightSearch() {
  const { t } = useTranslation();
  const open = useStore((s) => s.spotlightOpen);
  const closeSpotlight = useStore((s) => s.closeSpotlight);
  const openSheet = useStore((s) => s.openSheet);
  const openCustomAppDialog = useStore((s) => s.openCustomAppDialog);
  const installedQuery = trpc.apps.installed.useQuery(undefined, {
    enabled: open,
  });
  const backdropRef = useRef<HTMLDivElement>(null);

  const apps = installedQuery.data ?? [];

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        useStore.getState().toggleSpotlight();
      }
      if (e.key === "Escape" && useStore.getState().spotlightOpen) {
        useStore.getState().closeSpotlight();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  if (!open) return null;

  const handleSelect = (app: InstalledApp) => {
    openInstalledApp(app);
    closeSpotlight();
  };

  const handleAction = (action: NonNullable<Sheet>) => {
    closeSpotlight();
    openSheet(action);
  };

  const handleAddCustomApp = () => {
    closeSpotlight();
    openCustomAppDialog();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) closeSpotlight();
  };

  return (
    <Box ref={backdropRef} onClick={handleBackdropClick} sx={styles.backdrop}>
      <Box sx={styles.container}>
        <Command label={t("spotlight.placeholder")} style={cmdkStyles.root}>
          <Command.Input
            placeholder={t("spotlight.placeholder")}
            style={cmdkStyles.input}
            autoFocus
          />
          <Command.List style={cmdkStyles.list}>
            <Command.Empty style={cmdkStyles.empty}>
              {t("spotlight.noResults")}
            </Command.Empty>

            {apps.length > 0 && (
              <Command.Group
                heading={t("spotlight.apps")}
                style={cmdkStyles.group}
              >
                {apps.map((app) => (
                  <Command.Item
                    key={app.id}
                    value={`${app.name} ${app.tagline}`}
                    onSelect={() => handleSelect(app)}
                    style={cmdkStyles.item}
                  >
                    {app.icon ? (
                      <Box
                        component="img"
                        src={app.icon}
                        alt={app.name}
                        sx={styles.appIcon}
                      />
                    ) : (
                      <AppIconFallback name={app.name} size={32} />
                    )}
                    <Box sx={styles.itemText}>
                      <Typography sx={styles.itemName}>{app.name}</Typography>
                      <Typography sx={styles.itemTagline}>
                        {app.tagline}
                      </Typography>
                    </Box>
                    <StatusDot status={app.status} />
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            <Command.Group
              heading={t("spotlight.actions")}
              style={cmdkStyles.group}
            >
              <Command.Item
                value={t("desktop.apps.addCustom")}
                onSelect={handleAddCustomApp}
                style={cmdkStyles.item}
              >
                <Typography sx={styles.itemName}>
                  {t("desktop.apps.addCustom")}
                </Typography>
              </Command.Item>
              <Command.Item
                value="App Store Browse Install"
                onSelect={() => handleAction("appStore")}
                style={cmdkStyles.item}
              >
                <Typography sx={styles.itemName}>
                  {t("desktop.dock.appStore")}
                </Typography>
              </Command.Item>
              <Command.Item
                value="Settings Preferences"
                onSelect={() => handleAction("settings")}
                style={cmdkStyles.item}
              >
                <Typography sx={styles.itemName}>
                  {t("desktop.dock.settings")}
                </Typography>
              </Command.Item>
              <Command.Item
                value="System Monitor Info"
                onSelect={() => handleAction("system")}
                style={cmdkStyles.item}
              >
                <Typography sx={styles.itemName}>
                  {t("desktop.dock.system")}
                </Typography>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </Box>
    </Box>
  );
}

function StatusDot({ status }: { status: InstalledApp["status"] }) {
  return <Box sx={{ ...styles.statusDot, backgroundColor: STATUS_COLORS[status] }} />;
}

const styles = {
  backdrop: {
    position: "fixed" as const,
    inset: 0,
    zIndex: 100,
    display: "flex",
    justifyContent: "center",
    pt: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
    backdropFilter: "blur(4px)",
  },
  container: {
    width: 520,
    maxHeight: 420,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: colors.surface,
    border: "1px solid rgba(255,255,255,0.1)",
    boxShadow: "0 24px 48px rgba(0,0,0,0.4)",
  },
  appIcon: {
    width: 32,
    height: 32,
    borderRadius: 1.5,
    objectFit: "cover" as const,
    flexShrink: 0,
  },
  itemText: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    fontSize: "0.875rem",
    fontWeight: 500,
    color: colors.textPrimary,
  },
  itemTagline: {
    fontSize: "0.75rem",
    color: colors.textSecondary,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
  },
};

const cmdkStyles = {
  root: {
    display: "flex" as const,
    flexDirection: "column" as const,
    height: "100%",
  },
  input: {
    width: "100%",
    padding: "14px 16px",
    fontSize: "0.95rem",
    backgroundColor: "transparent",
    border: "none",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    color: colors.textPrimary,
    outline: "none",
    fontFamily: "inherit",
  },
  list: {
    overflowY: "auto" as const,
    maxHeight: 340,
    padding: "8px",
  },
  empty: {
    padding: "24px 16px",
    textAlign: "center" as const,
    color: colors.textSecondary,
    fontSize: "0.875rem",
  },
  group: {
    marginBottom: "4px",
  },
  item: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "8px 12px",
    borderRadius: "8px",
    cursor: "pointer",
    userSelect: "none" as const,
  },
};
