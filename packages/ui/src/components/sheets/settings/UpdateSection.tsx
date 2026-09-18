import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import SystemUpdateAltIcon from "@mui/icons-material/SystemUpdateAlt";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { useTranslation } from "react-i18next";
import { trpc } from "../../../lib/trpc";
import { colors } from "../../../app/theme";
import { relativeTime } from "../../../lib/relativeTime";
import { useSelfUpdate } from "../../../hooks/useSelfUpdate";
import { ReleaseNotes } from "./update/ReleaseNotes";
import { UpdateProgress } from "./update/UpdateProgress";

type State = "available" | "current" | "unknown";
const STATE_ICON = {
  available: <SystemUpdateAltIcon sx={{ fontSize: 28, color: colors.primary }} />,
  current: <CheckCircleOutlineIcon sx={{ fontSize: 28, color: colors.success }} />,
  unknown: <ErrorOutlineIcon sx={{ fontSize: 28, color: colors.warning }} />,
};

/** Settings tab: which version runs, what newer releases bring, and the update itself. */
export function UpdateSection() {
  const { t, i18n } = useTranslation();
  const utils = trpc.useUtils();
  const version = trpc.system.version.useQuery(undefined, { staleTime: 0, refetchOnWindowFocus: false });
  const check = trpc.system.checkForUpdates.useMutation({ onSuccess: (data) => utils.system.version.setData(undefined, data) });
  const selfUpdate = useSelfUpdate();

  if (version.isLoading) {
    return <Box sx={styles.centered}><CircularProgress size={24} sx={{ color: "primary.main" }} /></Box>;
  }
  const { current = "", latest = null, updateAvailable = false, newer = [], installed, checkedAt } = version.data ?? {};
  const state: State = updateAvailable ? "available" : latest === null ? "unknown" : "current";
  const notes = updateAvailable ? newer : installed ? [installed] : [];

  return (
    <Box sx={styles.root}>
      <Box sx={styles.header}>
        {STATE_ICON[state]}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600 }}>{t(`settings.update.state.${state}`, { version: latest })}</Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {t("settings.update.running", { version: current })}
            {checkedAt && ` · ${t("settings.update.checked", { when: relativeTime(checkedAt, Date.now(), i18n.language) })}`}
          </Typography>
        </Box>
        <Button size="small" disabled={check.isPending || selfUpdate.busy} onClick={() => check.mutate()}>
          {t(check.isPending ? "settings.update.checking" : "settings.update.checkAgain")}
        </Button>
        {updateAvailable && latest && (
          <Button variant="contained" size="small" disabled={selfUpdate.busy} onClick={() => selfUpdate.start(latest)}>
            {t("settings.update.updateTo", { version: latest })}
          </Button>
        )}
      </Box>

      {selfUpdate.phase === "failed" && <Alert severity="error">{selfUpdate.error || t("common.error")}</Alert>}
      {selfUpdate.phase === "slow" && (
        <Alert severity="warning" action={<Button size="small" onClick={() => window.location.reload()}>{t("settings.update.reload")}</Button>}>
          {t("settings.update.slow")}
        </Alert>
      )}
      {latest && <UpdateProgress phase={selfUpdate.phase} version={latest} />}
      {updateAvailable && !selfUpdate.busy && (
        <Typography variant="caption" sx={{ color: "text.secondary" }}>{t("settings.update.restartWarning")}</Typography>
      )}

      {notes.length > 0 && (
        <Typography variant="caption" sx={styles.label}>
          {updateAvailable ? t("settings.update.whatsNew", { count: newer.length }) : t("settings.update.inThisVersion")}
        </Typography>
      )}
      {notes.map((release) => <ReleaseNotes key={release.version} release={release} />)}
    </Box>
  );
}

const styles = {
  root: { display: "flex", flexDirection: "column" as const, gap: 1.5 },
  centered: { display: "flex", justifyContent: "center", py: 4 },
  header: { display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" as const },
  label: { color: "text.secondary", mt: 1 },
};
