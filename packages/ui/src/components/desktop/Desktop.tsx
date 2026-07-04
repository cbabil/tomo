import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Wallpaper } from "./Wallpaper";
import { Greeting } from "./Greeting";
import { WidgetBar } from "./WidgetBar";
import { AppGrid } from "./AppGrid";
import { Dock } from "./Dock";
import { SpotlightSearch } from "./SpotlightSearch";
import { UpdateBanner } from "./UpdateBanner";
import { DesktopLogout } from "./DesktopLogout";

const APP_VERSION = __APP_VERSION__;

export function Desktop() {
  return (
    <Box sx={styles.root}>
      <Wallpaper />
      <Box sx={styles.topRight}>
        <UpdateBanner />
        <DesktopLogout />
      </Box>
      <Box sx={styles.content}>
        <Greeting />
        <WidgetBar />
        <AppGrid />
      </Box>
      <Dock />
      <SpotlightSearch />
      <Typography sx={styles.version}>v{APP_VERSION}</Typography>
    </Box>
  );
}

const styles = {
  root: {
    position: "relative" as const,
    width: "100vw",
    height: "100vh",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column" as const,
  },
  topRight: {
    position: "fixed" as const,
    top: 12,
    right: 16,
    zIndex: 11,
    display: "flex",
    alignItems: "center",
    gap: 1,
  },
  content: {
    position: "relative" as const,
    zIndex: 1,
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    gap: 3,
    px: 4,
    pt: 4,
    pb: 12,
    overflow: "auto",
  },
  version: {
    position: "fixed" as const,
    bottom: 4,
    right: 8,
    fontSize: "0.65rem",
    color: "rgba(255,255,255,0.35)",
    zIndex: 11,
    userSelect: "none" as const,
    pointerEvents: "none",
  },
};
