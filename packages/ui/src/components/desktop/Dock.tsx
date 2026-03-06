import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import HomeIcon from "@mui/icons-material/Home";
import AppsIcon from "@mui/icons-material/Apps";
import SettingsIcon from "@mui/icons-material/Settings";
import MonitorIcon from "@mui/icons-material/Monitor";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useStore } from "../../hooks/useStore";
import { GlassCard } from "../ui/GlassCard";
import type { Sheet } from "../../types";

interface DockItem {
  id: string;
  labelKey: string;
  icon: React.ReactNode;
  action: Sheet | "home";
}

const dockItems: DockItem[] = [
  { id: "home", labelKey: "desktop.dock.home", icon: <HomeIcon />, action: "home" },
  { id: "appStore", labelKey: "desktop.dock.appStore", icon: <AppsIcon />, action: "appStore" },
  { id: "settings", labelKey: "desktop.dock.settings", icon: <SettingsIcon />, action: "settings" },
  { id: "system", labelKey: "desktop.dock.system", icon: <MonitorIcon />, action: "system" },
];

export function Dock() {
  const { t } = useTranslation();
  const activeSheet = useStore((s) => s.activeSheet);
  const openSheet = useStore((s) => s.openSheet);
  const closeSheet = useStore((s) => s.closeSheet);

  const handleClick = (item: DockItem) => {
    if (item.action === "home") {
      closeSheet();
    } else if (activeSheet === item.action) {
      closeSheet();
    } else {
      openSheet(item.action);
    }
  };

  return (
    <Box sx={styles.container}>
      <GlassCard sx={styles.dock}>
        {dockItems.map((item) => {
          const isActive = item.action !== "home" && activeSheet === item.action;
          return (
            <Tooltip key={item.id} title={t(item.labelKey)} placement="top">
              <motion.div whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.95 }}>
                <IconButton
                  onClick={() => handleClick(item)}
                  sx={{
                    ...styles.iconButton,
                    color: isActive ? "primary.main" : "text.secondary",
                  }}
                >
                  {item.icon}
                </IconButton>
              </motion.div>
            </Tooltip>
          );
        })}
      </GlassCard>
    </Box>
  );
}

const styles = {
  container: {
    position: "fixed" as const,
    bottom: 16,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 10,
  },
  dock: {
    display: "flex",
    gap: 1,
    px: 2,
    py: 1,
    borderRadius: 4,
  },
  iconButton: {
    fontSize: 28,
    "&:hover": {
      backgroundColor: "transparent",
      color: "#B388FF",
    },
  },
};
