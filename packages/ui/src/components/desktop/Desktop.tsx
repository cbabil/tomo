import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Wallpaper } from "./Wallpaper";
import { Greeting } from "./Greeting";
import { WidgetBar } from "./WidgetBar";
import { AppGrid } from "./AppGrid";
import { Dock } from "./Dock";
import { SpotlightSearch } from "./SpotlightSearch";

const APP_VERSION = __APP_VERSION__;

export function Desktop() {
  return (
    <Box sx={styles.root}>
      <Wallpaper />
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
    bottom: 8,
    right: 12,
    fontSize: "0.65rem",
    color: "rgba(255,255,255,0.25)",
    zIndex: 1,
    userSelect: "none" as const,
    pointerEvents: "none",
  },
};
