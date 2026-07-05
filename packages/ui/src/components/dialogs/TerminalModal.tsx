import Dialog from "@mui/material/Dialog";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Tooltip from "@mui/material/Tooltip";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useTranslation } from "react-i18next";
import { trpc } from "../../lib/trpc";
import { useStore } from "../../hooks/useStore";
import { lazy, Suspense } from "react";
import { appUrl } from "../../lib/urls";
import { TERMINAL_APP_ID } from "../../lib/apps";
import { TERMINAL_BG } from "./terminalTheme";
import { dialogStyles } from "./styles";

// Lazy so xterm.js (~280 KB) only loads when the terminal is actually opened,
// not on every desktop load.
const TerminalView = lazy(() =>
  import("./TerminalView").then((m) => ({ default: m.TerminalView })),
);

// macOS window "traffic light" colors. Red is wired to close; the yellow and
// green dots are decorative, matching the native window chrome.
const CLOSE_LIGHT = "#ff5f57";
const DECORATIVE_LIGHTS = ["#febc2e", "#28c840"];

export function TerminalModal() {
  const { t } = useTranslation();
  const open = useStore((s) => s.terminalOpen);
  const close = useStore((s) => s.closeTerminal);

  const installedQuery = trpc.apps.installed.useQuery(undefined, {
    enabled: open,
    refetchOnWindowFocus: false,
  });

  const terminal = installedQuery.data?.find((a) => a.id === TERMINAL_APP_ID);
  const port = terminal?.webPort;
  const url = appUrl(port);

  return (
    <Dialog
      open={open}
      onClose={close}
      slotProps={{ paper: { sx: styles.paper } }}
    >
      <Box sx={styles.titleBar}>
        <Box sx={styles.lights}>
          <Tooltip title={t("common.close")} placement="bottom">
            <Box
              component="button"
              aria-label={t("common.close")}
              onClick={close}
              sx={{ ...styles.light, ...styles.lightClose, backgroundColor: CLOSE_LIGHT }}
            />
          </Tooltip>
          {DECORATIVE_LIGHTS.map((color) => (
            <Box key={color} sx={{ ...styles.light, backgroundColor: color }} />
          ))}
        </Box>
        <Typography component="span" sx={styles.title}>
          {t("terminal.title")}
        </Typography>
        <Box sx={styles.rightSlot}>
          {url && (
            <Tooltip title={t("terminal.openInNewTab")} placement="bottom">
              <IconButton
                onClick={() => window.open(url, "_blank")}
                sx={styles.iconBtn}
                size="small"
              >
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>
      <Box sx={styles.body}>
        {installedQuery.isLoading ? (
          <Box sx={dialogStyles.centered}>
            <CircularProgress size={24} sx={{ color: "primary.main" }} />
          </Box>
        ) : port != null ? (
          <Suspense
            fallback={
              <Box sx={dialogStyles.centered}>
                <CircularProgress size={24} sx={{ color: "primary.main" }} />
              </Box>
            }
          >
            <TerminalView port={port} />
          </Suspense>
        ) : (
          <Box sx={dialogStyles.centered}>
            <Typography sx={dialogStyles.emptyText}>
              {t("terminal.notInstalled")}
            </Typography>
          </Box>
        )}
      </Box>
    </Dialog>
  );
}

const styles = {
  paper: {
    ...dialogStyles.fullscreenSize,
    backgroundColor: TERMINAL_BG,
    backgroundImage: "none",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column" as const,
  },
  titleBar: {
    position: "relative" as const,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    height: 40,
    px: 1.5,
    background: "linear-gradient(#3a3a3c, #2c2c2e)",
    borderBottom: "1px solid rgba(0,0,0,0.5)",
  },
  lights: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    zIndex: 1,
  },
  light: {
    width: 12,
    height: 12,
    p: 0,
    borderRadius: "50%",
    boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.2)",
  },
  lightClose: {
    border: "none",
    display: "block",
    cursor: "pointer",
    appearance: "none",
    outline: "none",
    "&:hover": { filter: "brightness(1.12)" },
  },
  title: {
    position: "absolute" as const,
    left: 0,
    right: 0,
    textAlign: "center" as const,
    pointerEvents: "none" as const,
    fontSize: "0.8125rem",
    fontWeight: 500,
    color: "rgba(255,255,255,0.6)",
  },
  rightSlot: {
    ...dialogStyles.titleActions,
    ml: "auto",
    zIndex: 1,
  },
  // Resting color only — the theme's global MuiIconButton override already
  // handles the transparent-bg / iconHover hover state.
  iconBtn: {
    color: "rgba(255,255,255,0.5)",
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    backgroundColor: TERMINAL_BG,
  },
};
