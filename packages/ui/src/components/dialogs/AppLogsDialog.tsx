import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Tooltip from "@mui/material/Tooltip";
import CloseIcon from "@mui/icons-material/Close";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useTranslation } from "react-i18next";
import { trpc } from "../../lib/trpc";
import { useStore } from "../../hooks/useStore";
import { colors } from "../../app/theme";
import { dialogStyles } from "./styles";

export function AppLogsDialog() {
  const { t } = useTranslation();
  const logsApp = useStore((s) => s.logsApp);
  const close = useStore((s) => s.closeLogs);

  const logsQuery = trpc.apps.logs.useQuery(
    { appId: logsApp?.id ?? "" },
    { enabled: Boolean(logsApp), refetchOnWindowFocus: false },
  );

  const logs = logsQuery.data?.logs?.trim() ?? "";

  return (
    <Dialog
      open={Boolean(logsApp)}
      onClose={close}
      slotProps={{ paper: { sx: styles.paper } }}
    >
      <DialogTitle sx={dialogStyles.title}>
        <Typography component="span" sx={styles.titleText} noWrap>
          {t("desktop.logs.title", { name: logsApp?.name ?? "" })}
        </Typography>
        <Box sx={styles.titleActions}>
          <Tooltip title={t("desktop.logs.refresh")} placement="top">
            <IconButton
              onClick={() => logsQuery.refetch()}
              disabled={logsQuery.isFetching}
              sx={dialogStyles.closeBtn}
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <IconButton onClick={close} sx={dialogStyles.closeBtn}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent sx={styles.content}>
        {logsQuery.isLoading ? (
          <Box sx={styles.centered}>
            <CircularProgress size={24} sx={{ color: "primary.main" }} />
          </Box>
        ) : logs ? (
          <Box component="pre" sx={styles.logs}>
            {logs}
          </Box>
        ) : (
          <Box sx={styles.centered}>
            <Typography sx={styles.empty}>{t("desktop.logs.empty")}</Typography>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}

const styles = {
  paper: {
    ...dialogStyles.paper,
    width: "min(820px, calc(100vw - 64px))",
  },
  titleText: {
    fontSize: "1rem",
    fontWeight: 600,
    maxWidth: "min(600px, calc(100vw - 200px))",
  },
  titleActions: {
    display: "flex",
    alignItems: "center",
    gap: 0.5,
  },
  content: {
    pt: 1,
  },
  logs: {
    m: 0,
    p: 2,
    borderRadius: 2,
    backgroundColor: "#000",
    color: "rgba(255,255,255,0.85)",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: "0.75rem",
    lineHeight: 1.5,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-all" as const,
    maxHeight: "60vh",
    overflowY: "auto" as const,
  },
  centered: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 160,
  },
  empty: {
    color: colors.textSecondary,
    fontSize: "0.875rem",
  },
};
