import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useTranslation } from "react-i18next";
import { connectTtyd } from "../../lib/ttyd";
import { terminalSocketUrl } from "../../lib/urls";
import { TERMINAL_BG, TERMINAL_THEME } from "./terminalTheme";

type Status = "connecting" | "open" | "closed";

/**
 * Renders a live terminal by connecting an xterm.js instance to the app's ttyd
 * WebSocket. Reconnects when `attempt` changes (via the retry button).
 */
export function TerminalView({ port }: { port: number }) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    const url = terminalSocketUrl(port);
    if (!element || !url) return;

    setStatus("connecting");

    const term = new Terminal({
      fontFamily: "'SF Mono', Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      cursorBlink: true,
      cursorStyle: "block",
      macOptionIsMeta: true,
      scrollback: 5000,
      theme: TERMINAL_THEME,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(element);
    fitAddon.fit();

    const connection = connectTtyd(term, url, {
      onOpen: () => {
        setStatus("open");
        term.focus();
      },
      onClose: () => setStatus("closed"),
      onError: () => setStatus("closed"),
    });

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {
        // Terminal not measurable yet (e.g. mid-close) — ignore.
      }
    });
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
      connection.dispose();
      term.dispose();
    };
  }, [port, attempt]);

  return (
    <Box sx={styles.root}>
      <Box ref={containerRef} sx={styles.terminal} />
      {status !== "open" && (
        <Box sx={styles.overlay}>
          {status === "connecting" ? (
            <CircularProgress size={24} sx={{ color: "primary.main" }} />
          ) : (
            <>
              <Typography sx={styles.overlayText}>
                {t("terminal.disconnected")}
              </Typography>
              <Button
                variant="outlined"
                size="small"
                onClick={() => setAttempt((n) => n + 1)}
                sx={styles.retry}
              >
                {t("terminal.reconnect")}
              </Button>
            </>
          )}
        </Box>
      )}
    </Box>
  );
}

const styles = {
  root: {
    position: "relative" as const,
    flex: 1,
    minHeight: 0,
    width: "100%",
    backgroundColor: TERMINAL_BG,
    p: 0.5,
  },
  terminal: {
    height: "100%",
    width: "100%",
    "& .xterm": { height: "100%" },
    "& .xterm-viewport": {
      scrollbarWidth: "thin",
      scrollbarColor: "rgba(255,255,255,0.25) transparent",
    },
    "& .xterm-viewport::-webkit-scrollbar": { width: "8px" },
    "& .xterm-viewport::-webkit-scrollbar-track": {
      backgroundColor: "transparent",
    },
    "& .xterm-viewport::-webkit-scrollbar-thumb": {
      backgroundColor: "rgba(255,255,255,0.25)",
      borderRadius: "4px",
    },
    "& .xterm-viewport::-webkit-scrollbar-thumb:hover": {
      backgroundColor: "rgba(255,255,255,0.4)",
    },
  },
  overlay: {
    position: "absolute" as const,
    inset: 0,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: 1.5,
    backgroundColor: "rgba(30,30,30,0.85)",
  },
  overlayText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: "0.875rem",
  },
  retry: {
    textTransform: "none" as const,
  },
};
