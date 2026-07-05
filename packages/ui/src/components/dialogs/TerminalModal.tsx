import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Tooltip from "@mui/material/Tooltip";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useTranslation } from "react-i18next";
import { trpc } from "../../lib/trpc";
import { useStore } from "../../hooks/useStore";
import { appUrl } from "../../lib/urls";
import { TERMINAL_APP_ID } from "../../lib/apps";
import { dialogStyles } from "./styles";

export function TerminalModal() {
  const { t } = useTranslation();
  const open = useStore((s) => s.terminalOpen);
  const close = useStore((s) => s.closeTerminal);

  const installedQuery = trpc.apps.installed.useQuery(undefined, {
    enabled: open,
    refetchOnWindowFocus: false,
  });

  const terminal = installedQuery.data?.find((a) => a.id === TERMINAL_APP_ID);
  const url = appUrl(terminal?.webPort);

  return (
    <Dialog open={open} onClose={close} slotProps={{ paper: { sx: styles.paper } }}>
      <DialogTitle sx={dialogStyles.title}>
        <Typography component="span" sx={styles.titleText}>
          {t("terminal.title")}
        </Typography>
        <Box sx={dialogStyles.titleActions}>
          {url && (
            <Tooltip title={t("terminal.openInNewTab")} placement="top">
              <IconButton
                onClick={() => window.open(url, "_blank")}
                sx={dialogStyles.closeBtn}
              >
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <IconButton onClick={close} sx={dialogStyles.closeBtn}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent sx={dialogStyles.fullscreenContent}>
        {installedQuery.isLoading ? (
          <Box sx={dialogStyles.centered}>
            <CircularProgress size={24} sx={{ color: "primary.main" }} />
          </Box>
        ) : url ? (
          <Box
            component="iframe"
            src={url}
            title={t("terminal.title")}
            sx={styles.frame}
          />
        ) : (
          <Box sx={dialogStyles.centered}>
            <Typography sx={dialogStyles.emptyText}>
              {t("terminal.notInstalled")}
            </Typography>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}

const styles = {
  paper: {
    ...dialogStyles.paper,
    ...dialogStyles.fullscreenSize,
  },
  titleText: {
    fontSize: "1rem",
    fontWeight: 600,
  },
  frame: {
    flex: 1,
    width: "100%",
    minHeight: 0,
    border: "none",
    borderRadius: 2,
    backgroundColor: "#000",
  },
};
