import { useCallback, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import SystemUpdateAltIcon from "@mui/icons-material/SystemUpdateAlt";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { useTranslation } from "react-i18next";
import { trpc } from "../../../lib/trpc";
import { colors } from "../../../app/theme";

const HEALTH_POLL_INTERVAL_MS = 2_000;
const HEALTH_POLL_TIMEOUT_MS = 60_000;

export function UpdateSection() {
  const { t } = useTranslation();
  const versionQuery = trpc.system.version.useQuery(undefined, {
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const updateMutation = trpc.system.update.useMutation();
  const [polling, setPolling] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const pollHealth = useCallback(() => {
    if (timerRef.current) return;
    setPolling(true);
    const started = Date.now();
    timerRef.current = setInterval(async () => {
      if (Date.now() - started > HEALTH_POLL_TIMEOUT_MS) {
        clearInterval(timerRef.current);
        timerRef.current = undefined;
        setPolling(false);
        return;
      }
      try {
        const res = await fetch("/trpc/system.version", {
          credentials: "include",
        });
        if (res.ok) {
          clearInterval(timerRef.current);
          window.location.reload();
        }
      } catch {
        // server still restarting
      }
    }, HEALTH_POLL_INTERVAL_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleUpdate = async () => {
    try {
      await updateMutation.mutateAsync();
    } catch {
      // mutation may fail if server restarts mid-response
    }
    pollHealth();
  };

  const { current, latest, updateAvailable } = versionQuery.data ?? {};
  const isUpdating = updateMutation.isPending || polling;
  const hasError = updateMutation.isError && !polling;
  const checkFailed = latest == null && !versionQuery.isLoading;

  if (versionQuery.isLoading) {
    return (
      <Box sx={styles.centered}>
        <CircularProgress size={24} sx={{ color: "primary.main" }} />
      </Box>
    );
  }

  return (
    <Box sx={styles.card}>
      {/* Icon */}
      <Box sx={styles.iconContainer}>
        {updateAvailable ? (
          <SystemUpdateAltIcon sx={{ fontSize: 40, color: colors.primary }} />
        ) : checkFailed ? (
          <ErrorOutlineIcon sx={{ fontSize: 40, color: colors.warning }} />
        ) : (
          <CheckCircleOutlineIcon sx={{ fontSize: 40, color: colors.success }} />
        )}
      </Box>

      {/* Title */}
      <Typography sx={styles.title}>
        {updateAvailable
          ? t("settings.update.updateAvailable")
          : checkFailed
            ? t("settings.update.checkFailed")
            : t("settings.update.upToDate")}
      </Typography>

      {/* Version info */}
      <Box sx={styles.versionRow}>
        <VersionBadge label={current ?? "—"} sublabel={t("settings.update.currentVersion")} />
        {latest && (
          <>
            <Box sx={styles.arrow}>→</Box>
            <VersionBadge label={latest} sublabel={t("settings.update.latestVersion")} />
          </>
        )}
      </Box>

      {/* Error message */}
      {hasError && (
        <Typography sx={styles.errorText}>
          {updateMutation.error?.message ?? t("common.error")}
        </Typography>
      )}

      {/* Update button */}
      {updateAvailable && (
        <Box sx={styles.actionArea}>
          <Button
            variant="contained"
            onClick={handleUpdate}
            disabled={isUpdating}
            sx={styles.updateButton}
          >
            {isUpdating ? (
              <>
                <CircularProgress size={18} sx={{ color: "common.white", mr: 1 }} />
                {t("settings.update.updating")}
              </>
            ) : (
              t("settings.update.updateNow")
            )}
          </Button>
          <Typography variant="caption" sx={styles.hint}>
            {t("settings.update.restartWarning")}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

function VersionBadge({ label, sublabel }: { label: string; sublabel: string }) {
  return (
    <Box sx={styles.badge}>
      <Typography sx={styles.badgeVersion}>{label}</Typography>
      <Typography sx={styles.badgeLabel}>{sublabel}</Typography>
    </Box>
  );
}

const styles = {
  centered: {
    display: "flex",
    justifyContent: "center",
    py: 4,
  },
  card: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    textAlign: "center" as const,
    py: 4,
    px: 3,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    mb: 2,
  },
  title: {
    fontSize: "1.1rem",
    fontWeight: 600,
    color: "text.primary",
    mb: 2.5,
  },
  versionRow: {
    display: "flex",
    alignItems: "center",
    gap: 2,
    mb: 1,
  },
  arrow: {
    color: "text.secondary",
    fontSize: "1.2rem",
    fontWeight: 300,
  },
  badge: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 0.5,
    px: 2.5,
    py: 1.5,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.05)",
    minWidth: 100,
  },
  badgeVersion: {
    fontSize: "1rem",
    fontWeight: 700,
    color: "text.primary",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  },
  badgeLabel: {
    fontSize: "0.7rem",
    color: "text.secondary",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  errorText: {
    fontSize: "0.8rem",
    color: colors.error,
    mt: 1,
    mb: 1,
  },
  actionArea: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    mt: 3,
    gap: 1,
  },
  updateButton: {
    textTransform: "none" as const,
    borderRadius: 2,
    px: 5,
    py: 1.2,
    fontSize: "0.95rem",
    fontWeight: 600,
  },
  hint: {
    color: "text.secondary",
    fontSize: "0.75rem",
  },
};
